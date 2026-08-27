"""
WMB local-LLM proxy (Anthropic -> OpenAI translator).

Speaks the Anthropic Messages API on the way IN (what the app's hard-wired
Anthropic SDK sends to POST /v1/messages) and the OpenAI Chat Completions API
on the way OUT (to a local, LAN-only vLLM / OpenAI-compatible server).

Single upstream model: the proxy ignores the incoming `model` field and always
targets LOCAL_LLM_MODEL (a single-model vLLM box). This makes "route the whole
app to the local model for free testing" trivial and robust.

Why dependency-free: this runs as a slim docker service and must not require a
litellm / openai install. Python stdlib only (urllib + http.server + json +
threading).

Env:
  LOCAL_LLM_BASE_URL   upstream OpenAI-compatible base (default http://10.33.0.153:8888)
  LOCAL_LLM_MODEL      upstream model id (default Qwen3.8-Flash-Next-NVFP4)
  LOCAL_LLM_PORT       proxy listen port (default 30400)
  LOCAL_LLM_API_KEY    optional upstream key (LAN-only needs none)
"""
import json
import os
import sys
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_URL = os.environ.get("LOCAL_LLM_BASE_URL", "http://10.33.0.153:8888/v1").rstrip("/")
MODEL = os.environ.get("LOCAL_LLM_MODEL", "Qwen3.8-Flash-Next-NVFP4")
PORT = int(os.environ.get("LOCAL_LLM_PORT", "30400"))
API_KEY = os.environ.get("LOCAL_LLM_API_KEY", "")
TIMEOUT = float(os.environ.get("LOCAL_LLM_TIMEOUT", "300"))
# Reasoning effort for thinking models (vLLM OpenAI-compatible parameter).
# "none" disables it entirely.
REASONING_EFFORT = os.environ.get("LOCAL_LLM_REASONING_EFFORT", "medium")

log = lambda *a: print("[local-proxy]", *a, flush=True)


# ── Anthropic request -> OpenAI request ─────────────────────────────────────

def _system_to_text(system):
    if not system:
        return None
    if isinstance(system, str):
        return system
    if isinstance(system, list):
        return " ".join(
            b.get("text", "") for b in system
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return None


def _block_text(content):
    """Extract plain text from a tool_result content (str or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return str(content or "")


def anthropic_to_openai(body):
    messages = []
    sys_text = _system_to_text(body.get("system"))
    if sys_text:
        messages.append({"role": "system", "content": sys_text})

    for msg in body.get("messages", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if isinstance(content, str):
            messages.append({"role": role, "content": content})
            continue

        # content is a list of blocks
        text_parts = []
        tool_calls = []
        tool_results = []
        for block in content:
            if isinstance(block, str):
                text_parts.append(block)
                continue
            if not isinstance(block, dict):
                continue
            btype = block.get("type", "")
            if btype == "text":
                text_parts.append(block.get("text", ""))
            elif btype == "tool_use":
                tool_calls.append({
                    "id": block.get("id", ""),
                    "type": "function",
                    "function": {
                        "name": block.get("name", ""),
                        "arguments": json.dumps(block.get("input", {})),
                    },
                })
            elif btype == "tool_result":
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": block.get("tool_use_id", ""),
                    "content": _block_text(block.get("content", "")),
                })
            # thinking / redacted_thinking blocks are intentionally dropped

        if role == "assistant" and tool_calls:
            m = {"role": "assistant"}
            m["content"] = "\n".join(text_parts) if text_parts else None
            m["tool_calls"] = tool_calls
            messages.append(m)
            messages.extend(tool_results)
        else:
            # user (or tool results carried in a user message)
            if tool_results:
                # OpenAI wants tool results as their own messages; emit them,
                # then any accompanying user text.
                for tr in tool_results:
                    messages.append(tr)
                if text_parts:
                    messages.append({"role": "user", "content": "\n".join(text_parts)})
            else:
                messages.append({"role": role, "content": "\n".join(text_parts) if text_parts else ""})

    tools = None
    if body.get("tools"):
        tools = []
        for t in body["tools"]:
            tools.append({
                "type": "function",
                "function": {
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {}),
                },
            })

    req = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": body.get("max_tokens", 4096),
        "temperature": body.get("temperature", 1.0),
        "reasoning_effort": REASONING_EFFORT,
    }
    if tools:
        req["tools"] = tools
    if body.get("stream"):
        req["stream"] = True
    return req


# ── OpenAI response -> Anthropic response (non-stream) ──────────────────────

def openai_to_anthropic(resp, req_model):
    choice = resp["choices"][0] if resp.get("choices") else {}
    m = choice.get("message", {}) or {}
    content_blocks = []

    text = m.get("content")
    if text:
        content_blocks.append({"type": "text", "text": text})

    for tc in (m.get("tool_calls") or []):
        fn = tc.get("function", {}) or {}
        args = fn.get("arguments", "{}")
        if isinstance(args, str):
            try:
                args = json.loads(args) if args else {}
            except Exception:
                args = {}
        content_blocks.append({
            "type": "tool_use",
            "id": tc.get("id", ""),
            "name": fn.get("name", ""),
            "input": args,
        })

    if not content_blocks:
        content_blocks.append({"type": "text", "text": ""})

    finish = choice.get("finish_reason")
    stop_reason = {
        "tool_calls": "tool_use",
        "length": "max_tokens",
        "stop": "end_turn",
    }.get(finish, "end_turn")

    usage = resp.get("usage") or {}
    return {
        "id": resp.get("id", "msg_local"),
        "type": "message",
        "role": "assistant",
        "model": req_model,
        "content": content_blocks,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        },
    }


# ── HTTP client to upstream ─────────────────────────────────────────────────

def _upstream_headers():
    h = {"Content-Type": "application/json"}
    if API_KEY:
        h["Authorization"] = f"Bearer {API_KEY}"
    return h


def _upstream_json(req):
    data = json.dumps(req).encode()
    r = urllib.request.Request(BASE_URL + "/chat/completions", data=data,
                                headers=_upstream_headers(), method="POST")
    with urllib.request.urlopen(r, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode())


def _upstream_stream_iter(req):
    """Yield decoded OpenAI SSE data payloads (each a JSON object)."""
    data = json.dumps(req).encode()
    r = urllib.request.Request(BASE_URL + "/chat/completions", data=data,
                                headers=_upstream_headers(), method="POST")
    with urllib.request.urlopen(r, timeout=TIMEOUT) as resp:
        buf = ""
        while True:
            chunk = resp.read(1)
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if payload == "[DONE]":
                    return
                try:
                    yield json.loads(payload)
                except Exception:
                    continue


# ── Request handler ─────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass  # quiet

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok", "upstream": BASE_URL, "model": MODEL})
        elif self.path in ("/v1/models", "/models"):
            self._json(200, {
                "object": "list",
                "data": [{"id": MODEL, "object": "model",
                          "created": 0, "owned_by": "local-vllm"}],
            })
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path in ("/v1/messages", "/messages"):
            self._handle_messages()
        else:
            self._json(404, {"error": f"unknown path {self.path}"})

    def _sse(self, event, data):
        out = f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()
        self.wfile.write(out)
        self.wfile.flush()

    def _handle_messages(self):
        body = self._body()
        req_model = body.get("model", MODEL)
        oai_req = anthropic_to_openai(body)
        try:
            if not oai_req.get("stream"):
                resp = _upstream_json(oai_req)
                self._json(200, openai_to_anthropic(resp, req_model))
                return
            self._stream(oai_req, req_model)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            try:
                derr = json.loads(detail)
                msg = derr.get("error", {}).get("message", detail)
            except Exception:
                msg = detail
            self._json(e.code, {"type": "error", "error": {
                "type": "upstream_error", "message": msg}})
        except Exception as e:
            log("ERROR", e)
            self._json(500, {"type": "error", "error": {
                "type": "server_error", "message": str(e)}})

    def _stream(self, oai_req, req_model):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        self._sse("message_start", {
            "type": "message_start",
            "message": {
                "id": "msg_local_stream", "type": "message", "role": "assistant",
                "model": req_model, "content": [], "stop_reason": None,
                "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        })

        next_index = 0
        text_open = False
        text_index = None
        tools = {}  # openai idx -> {"index": anthropic_idx, "id":.., "name":..}
        usage = {"input_tokens": 0, "output_tokens": 0}

        def ensure_text():
            nonlocal next_index, text_open, text_index
            if not text_open:
                text_index = next_index
                next_index += 1
                text_open = True
                self._sse("content_block_start", {
                    "type": "content_block_start", "index": text_index,
                    "content_block": {"type": "text", "text": ""},
                })

        def close_text():
            nonlocal text_open
            if text_open:
                self._sse("content_block_stop", {"type": "content_block_stop",
                                                 "index": text_index})
                text_open = False

        try:
            for chunk in _upstream_stream_iter(oai_req):
                if chunk.get("usage"):
                    u = chunk["usage"]
                    usage["input_tokens"] = u.get("prompt_tokens", usage["input_tokens"])
                    usage["output_tokens"] = u.get("completion_tokens", usage["output_tokens"])
                if not chunk.get("choices"):
                    continue
                choice = chunk["choices"][0]
                delta = choice.get("delta", {}) or {}
                finish = choice.get("finish_reason")

                if delta.get("content"):
                    ensure_text()
                    self._sse("content_block_delta", {
                        "type": "content_block_delta", "index": text_index,
                        "delta": {"type": "text_delta", "text": delta["content"]},
                    })

                for tc in (delta.get("tool_calls") or []):
                    idx = tc.get("index", 0)
                    fn = tc.get("function", {}) or {}
                    if idx not in tools:
                        # close text block if open, tools take the next index
                        close_text()
                        aindex = next_index
                        next_index += 1
                        tools[idx] = {
                            "index": aindex,
                            "id": tc.get("id", f"toolu_{idx}"),
                            "name": fn.get("name", ""),
                        }
                        self._sse("content_block_start", {
                            "type": "content_block_start", "index": aindex,
                            "content_block": {
                                "type": "tool_use", "id": tools[idx]["id"],
                                "name": tools[idx]["name"], "input": {},
                            },
                        })
                    if fn.get("arguments"):
                        self._sse("content_block_delta", {
                            "type": "content_block_delta",
                            "index": tools[idx]["index"],
                            "delta": {"type": "input_json_delta",
                                      "partial_json": fn["arguments"]},
                        })

                if finish:
                    close_text()
                    for t in tools.values():
                        self._sse("content_block_stop", {"type": "content_block_stop",
                                                         "index": t["index"]})
                    stop_reason = {
                        "tool_calls": "tool_use",
                        "length": "max_tokens",
                        "stop": "end_turn",
                    }.get(finish, "end_turn")
                    self._sse("message_delta", {
                        "type": "message_delta",
                        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                        "usage": {"output_tokens": usage["output_tokens"]},
                    })
                    self._sse("message_stop", {"type": "message_stop"})
                    break
        except Exception as e:
            log("STREAM ERROR", e)
            try:
                self._sse("error", {"type": "error",
                                    "error": {"type": "server_error", "message": str(e)}})
            except Exception:
                pass


class ThreadedServer(ThreadingHTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    log(f"upstream={BASE_URL} model={MODEL} port={PORT}")
    srv = ThreadedServer(("0.0.0.0", PORT), Handler)
    log("listening")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
