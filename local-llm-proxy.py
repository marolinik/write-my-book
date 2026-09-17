"""
WMB local-LLM proxy (Anthropic -> OpenAI translator).

Speaks the Anthropic Messages API on the way IN (what the app's hard-wired
Anthropic SDK sends to POST /v1/messages) and the OpenAI Chat Completions API
on the way OUT (to a local, LAN-only vLLM / OpenAI-compatible server).

Model-aware: the incoming `model` field (a WMB registry id such as
"local-deepseek/sonnet") is mapped through LOCAL_LLM_MODEL_MAP to the model name
the LAN gateway serves ("deepseek-v4.1-flash", ...). Anything unmapped falls
back to LOCAL_LLM_MODEL, so an unknown/foreign id (a paid-provider model hitting
the local fallback route) still gets served instead of 404-ing upstream.
Set LOCAL_LLM_PIN_MODEL=1 to force every request onto LOCAL_LLM_MODEL (the old
single-model behaviour).

Why dependency-free: this runs as a slim docker service and must not require a
litellm / openai install. Python stdlib only (urllib + http.server + json +
threading).

Env:
  LOCAL_LLM_BASE_URL   upstream OpenAI-compatible base (default the LiteLLM
                       fleet gateway http://10.33.0.153:4000/v1)
  LOCAL_LLM_MODEL      upstream model id used for unmapped ids
                       (default deepseek-v4.1-flash)
  LOCAL_LLM_MODEL_MAP  JSON object {registry id: gateway model}; merged over the
                       built-in DEFAULT_MODEL_MAP
  LOCAL_LLM_PIN_MODEL  "1" = ignore the request model, always use LOCAL_LLM_MODEL
  LOCAL_LLM_PORT       proxy listen port (default 30400)
  LOCAL_LLM_API_KEY    optional upstream key (LAN-only needs none)
"""
import json
import os
import sys
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_URL = os.environ.get("LOCAL_LLM_BASE_URL", "http://10.33.0.153:4000/v1").rstrip("/")
MODEL = os.environ.get("LOCAL_LLM_MODEL", "deepseek-v4.1-flash")
PIN_MODEL = os.environ.get("LOCAL_LLM_PIN_MODEL", "") == "1"

# WMB registry id -> model name served by the LAN gateway (see GATEWAY-SETUP.md
# in "Setting up DgX spark"). Every tier slot of a registry family maps to the
# same upstream model: the gateway serves one model per name, and WMB's tier
# slots exist only so role/cheap-tier resolution stays inside the family.
DEFAULT_MODEL_MAP = {
    # DeepSeek V4.1 Flash (H100) — the WMB default.
    "local-deepseek/opus": "deepseek-v4.1-flash",
    "local-deepseek/sonnet": "deepseek-v4.1-flash",
    "local-deepseek/haiku": "deepseek-v4.1-flash",
    # DeepSeek V4 Flash (previous generation, still served).
    "local-deepseek-v4/opus": "deepseek-v4-flash",
    "local-deepseek-v4/sonnet": "deepseek-v4-flash",
    "local-deepseek-v4/haiku": "deepseek-v4-flash",
    # Qwen3.8 Flash-Next on the Sparks (1M context, parallel agents).
    "local-qwenflash/opus": "qwen3.8-flash-next",
    "local-qwenflash/sonnet": "qwen3.8-flash-next",
    "local-qwenflash/haiku": "qwen3.8-flash-next",
    # Qwen3.8 27B uncensored on Zika (fastest solo, vision, no refusals).
    "local-zika/opus": "qwen3.8-27b-uncensored",
    "local-zika/sonnet": "qwen3.8-27b-uncensored",
    "local-zika/haiku": "qwen3.8-27b-uncensored",
    # Legacy ids already stored in user/book settings rows.
    "local/qwen38": "qwen3.8-flash-next",
    "local/qwen38-haiku": "qwen3.8-flash-next",
}


def _load_model_map():
    """DEFAULT_MODEL_MAP with LOCAL_LLM_MODEL_MAP (JSON) merged over it."""
    raw = os.environ.get("LOCAL_LLM_MODEL_MAP", "")
    if not raw.strip():
        return dict(DEFAULT_MODEL_MAP)
    try:
        override = json.loads(raw)
    except Exception as e:
        log("LOCAL_LLM_MODEL_MAP is not valid JSON, ignoring:", e)
        return dict(DEFAULT_MODEL_MAP)
    if not isinstance(override, dict):
        log("LOCAL_LLM_MODEL_MAP must be a JSON object, ignoring")
        return dict(DEFAULT_MODEL_MAP)
    merged = dict(DEFAULT_MODEL_MAP)
    merged.update({str(k): str(v) for k, v in override.items()})
    return merged


def resolve_upstream_model(req_model):
    """Map a requested (registry) model id to the gateway model name.

    Unmapped ids resolve to MODEL rather than failing: the local route doubles
    as the fallback for paid-provider models when no provider key is present,
    and those requests carry foreign ids the gateway has never heard of.
    """
    if PIN_MODEL:
        return MODEL
    if not req_model:
        return MODEL
    if req_model in MODEL_MAP:
        return MODEL_MAP[req_model]
    # A raw gateway model name passes straight through.
    if req_model in set(MODEL_MAP.values()):
        return req_model
    log(f"unmapped model {req_model!r} -> serving {MODEL!r}")
    return MODEL
PORT = int(os.environ.get("LOCAL_LLM_PORT", "30400"))
API_KEY = os.environ.get("LOCAL_LLM_API_KEY", "")
TIMEOUT = float(os.environ.get("LOCAL_LLM_TIMEOUT", "300"))
# Reasoning effort for thinking models (vLLM OpenAI-compatible parameter).
# "none" disables it entirely.
REASONING_EFFORT = os.environ.get("LOCAL_LLM_REASONING_EFFORT", "medium")

log = lambda *a: print("[local-proxy]", *a, flush=True)

MODEL_MAP = _load_model_map()


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


def anthropic_to_openai(body, upstream_model=None):
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

    # Caller reasoning opt-out: the quick-assist surfaces (ghost-text,
    # inline-edit) cannot pay for thinking blocks out of their tiny token
    # budgets (D-100) and send OpenRouter-style reasoning={"enabled":false}
    # (or effort "none") — the local route delivers that directive through
    # this translator, which maps it (or Anthropic's thinking.disabled) to
    # the upstream "none" effort. Anything else keeps the operator default.
    effort = REASONING_EFFORT
    th = body.get("thinking")
    if isinstance(th, dict) and th.get("type") == "disabled":
        effort = "none"
    rs = body.get("reasoning")
    if isinstance(rs, dict) and (rs.get("enabled") is False or rs.get("effort") == "none"):
        effort = "none"

    req = {
        "model": upstream_model or resolve_upstream_model(body.get("model")),
        "messages": messages,
        "max_tokens": body.get("max_tokens", 4096),
        "temperature": body.get("temperature", 1.0),
        "reasoning_effort": effort,
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
            self._json(200, {"status": "ok", "upstream": BASE_URL,
                             "default_model": MODEL, "pinned": PIN_MODEL,
                             "models": MODEL_MAP})
        elif self.path in ("/v1/models", "/models"):
            # Advertise the gateway model names (deduped, stable order) plus
            # the registry ids that route to them.
            names = list(dict.fromkeys(list(MODEL_MAP.values()) + [MODEL]))
            self._json(200, {
                "object": "list",
                "data": [{"id": n, "object": "model",
                          "created": 0, "owned_by": "local-gateway"}
                         for n in names],
                "registry_map": MODEL_MAP,
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
        upstream_model = resolve_upstream_model(body.get("model"))
        oai_req = anthropic_to_openai(body, upstream_model)
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


# Loopback by default: as a host process this would otherwise let anything on
# the LAN proxy into the gateway. Containers publish it themselves and must set
# LOCAL_LLM_BIND=0.0.0.0 to be reachable from the compose network.
BIND = os.environ.get("LOCAL_LLM_BIND", "127.0.0.1")


if __name__ == "__main__":
    log(f"upstream={BASE_URL} default_model={MODEL} pinned={PIN_MODEL} bind={BIND}:{PORT}")
    log("model map:", ", ".join(f"{k}->{v}" for k, v in MODEL_MAP.items()))
    srv = ThreadedServer((BIND, PORT), Handler)
    log("listening")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
