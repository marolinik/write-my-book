"""
Minimal LiteLLM proxy that translates Anthropic messages format to OpenRouter.
Uses LiteLLM as a library (not CLI) to avoid config loading bugs.
"""
import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import litellm

# Suppress litellm debug output
litellm.suppress_debug_info = True

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 30399

# All models available through this proxy
# OpenRouter models (non-Anthropic, routed via openrouter/ prefix in LiteLLM)
MODELS = {
    "minimax/minimax-m2.5": "openrouter/minimax/minimax-m2.5",
    "qwen/qwen3.5-397b-a17b": "openrouter/qwen/qwen3.5-397b-a17b",
    "qwen/qwen3-max-thinking": "openrouter/qwen/qwen3-max-thinking",
    "moonshotai/kimi-k2.5": "openrouter/moonshotai/kimi-k2.5",
    "z-ai/glm-5": "openrouter/z-ai/glm-5",
    "deepseek/deepseek-v3.2": "openrouter/deepseek/deepseek-v3.2",
    # ── OpenAI (direct provider key via x-provider-key header) ──
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "o3": "openai/o3",
    "o4-mini": "openai/o4-mini",
    # ── Google Gemini (direct provider key via x-provider-key header) ──
    "gemini-2.5-pro-preview-05-06": "gemini/gemini-2.5-pro-preview-05-06",
    "gemini-2.5-flash-preview-05-20": "gemini/gemini-2.5-flash-preview-05-20",
    "gemini-2.0-flash": "gemini/gemini-2.0-flash",
    # ── xAI Grok (direct provider key via x-provider-key header) ──
    "grok-4": "xai/grok-4",
    "grok-3": "xai/grok-3",
    "grok-3-mini": "xai/grok-3-mini",
}


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[proxy] {args[0]}", flush=True)

    def _send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "models": list(MODELS.keys())})
        elif self.path in ("/v1/models", "/models"):
            data = [{"id": k, "object": "model", "created": 1677610602, "owned_by": "openrouter"} for k in MODELS]
            self._send_json(200, {"data": data, "object": "list"})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        body = self._read_body()

        # Handle both /v1/messages (Anthropic) and /chat/completions (OpenAI)
        if self.path in ("/v1/messages", "/messages"):
            self._handle_anthropic_messages(body)
        elif self.path in ("/v1/chat/completions", "/chat/completions"):
            self._handle_chat_completions(body)
        else:
            self._send_json(404, {"error": f"unknown path: {self.path}"})

    def _handle_anthropic_messages(self, body):
        """Translate Anthropic messages format -> litellm -> Anthropic response format"""
        model_name = body.get("model", "")
        litellm_model = MODELS.get(model_name)
        if not litellm_model:
            self._send_json(400, {"error": f"Unknown model: {model_name}. Available: {list(MODELS.keys())}"})
            return

        # Per-request API key override (SECURITY: never log the key value)
        provider_key = self.headers.get("x-provider-key")
        target_provider = self.headers.get("x-target-provider")
        if target_provider:
            print(f"[proxy] Routing to provider: {target_provider} (direct key: {'yes' if provider_key else 'no'})", flush=True)

        # Check if streaming
        stream = body.get("stream", False)

        # Convert Anthropic messages to OpenAI format
        messages = []
        system_text = body.get("system")
        if system_text:
            if isinstance(system_text, list):
                # Anthropic system can be a list of content blocks
                system_text = " ".join(
                    b["text"] for b in system_text if isinstance(b, dict) and b.get("type") == "text"
                )
            messages.append({"role": "system", "content": system_text})

        for msg in body.get("messages", []):
            role = msg.get("role", "user")
            content = msg.get("content", "")

            # Handle content blocks (Anthropic format)
            if isinstance(content, list):
                text_parts = []
                tool_calls = []
                tool_results = []

                for block in content:
                    if isinstance(block, str):
                        text_parts.append(block)
                    elif isinstance(block, dict):
                        btype = block.get("type", "")
                        if btype == "text":
                            text_parts.append(block.get("text", ""))
                        elif btype == "tool_use":
                            tool_calls.append({
                                "id": block.get("id", ""),
                                "type": "function",
                                "function": {
                                    "name": block.get("name", ""),
                                    "arguments": json.dumps(block.get("input", {}))
                                }
                            })
                        elif btype == "tool_result":
                            # Tool results come as user messages in Anthropic format
                            result_content = block.get("content", "")
                            if isinstance(result_content, list):
                                result_content = " ".join(
                                    b.get("text", "") for b in result_content if isinstance(b, dict)
                                )
                            tool_results.append({
                                "role": "tool",
                                "tool_call_id": block.get("tool_use_id", ""),
                                "content": str(result_content)
                            })

                if role == "assistant":
                    msg_dict = {"role": "assistant"}
                    if text_parts:
                        msg_dict["content"] = "\n".join(text_parts)
                    if tool_calls:
                        msg_dict["tool_calls"] = tool_calls
                        if not text_parts:
                            msg_dict["content"] = None
                    messages.append(msg_dict)
                elif tool_results:
                    # Add tool results as separate messages
                    for tr in tool_results:
                        messages.append(tr)
                else:
                    messages.append({"role": role, "content": "\n".join(text_parts) if text_parts else ""})
            else:
                messages.append({"role": role, "content": str(content)})

        # Convert Anthropic tools to OpenAI format
        tools = None
        if body.get("tools"):
            tools = []
            for tool in body["tools"]:
                tools.append({
                    "type": "function",
                    "function": {
                        "name": tool.get("name", ""),
                        "description": tool.get("description", ""),
                        "parameters": tool.get("input_schema", {})
                    }
                })

        try:
            if stream:
                self._handle_streaming(litellm_model, messages, body, tools, provider_key)
            else:
                self._handle_non_streaming(litellm_model, messages, body, tools, provider_key)
        except Exception as e:
            print(f"[proxy] Error: {e}", flush=True)
            self._send_json(500, {"error": {"type": "server_error", "message": str(e)}})

    def _handle_non_streaming(self, litellm_model, messages, body, tools, provider_key=None):
        kwargs = {
            "model": litellm_model,
            "messages": messages,
            "max_tokens": body.get("max_tokens", 4096),
            "temperature": body.get("temperature", 1.0),
            "drop_params": True,
        }
        if tools:
            kwargs["tools"] = tools
        if provider_key:
            kwargs["api_key"] = provider_key

        resp = litellm.completion(**kwargs)

        # Convert OpenAI response to Anthropic format
        choice = resp.choices[0]
        content_blocks = []

        if choice.message.content:
            content_blocks.append({"type": "text", "text": choice.message.content})

        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except:
                    args = {}
                content_blocks.append({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": args
                })

        if not content_blocks:
            content_blocks.append({"type": "text", "text": ""})

        stop_reason = "end_turn"
        if choice.finish_reason == "tool_calls":
            stop_reason = "tool_use"
        elif choice.finish_reason == "length":
            stop_reason = "max_tokens"

        anthropic_resp = {
            "id": f"msg_{resp.id}",
            "type": "message",
            "role": "assistant",
            "model": body.get("model", ""),
            "content": content_blocks,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {
                "input_tokens": resp.usage.prompt_tokens if resp.usage else 0,
                "output_tokens": resp.usage.completion_tokens if resp.usage else 0,
            }
        }

        self._send_json(200, anthropic_resp)

    def _handle_streaming(self, litellm_model, messages, body, tools, provider_key=None):
        kwargs = {
            "model": litellm_model,
            "messages": messages,
            "max_tokens": body.get("max_tokens", 4096),
            "temperature": body.get("temperature", 1.0),
            "stream": True,
            "drop_params": True,
        }
        if tools:
            kwargs["tools"] = tools
        if provider_key:
            kwargs["api_key"] = provider_key

        resp = litellm.completion(**kwargs)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        # Send message_start event
        msg_start = {
            "type": "message_start",
            "message": {
                "id": "msg_proxy",
                "type": "message",
                "role": "assistant",
                "model": body.get("model", ""),
                "content": [],
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0}
            }
        }
        self._write_sse(msg_start)

        # Track state for streaming
        content_block_started = False
        tool_block_started = False
        current_tool_index = -1
        tool_calls_buffer = {}
        text_started = False

        try:
            for chunk in resp:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue

                finish_reason = chunk.choices[0].finish_reason

                # Handle text content
                if delta.content:
                    if not text_started:
                        self._write_sse({
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {"type": "text", "text": ""}
                        })
                        text_started = True
                        content_block_started = True

                    self._write_sse({
                        "type": "content_block_delta",
                        "index": 0,
                        "delta": {"type": "text_delta", "text": delta.content}
                    })

                # Handle tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index if tc.index is not None else 0

                        if idx not in tool_calls_buffer:
                            # Close text block if open
                            if content_block_started:
                                self._write_sse({"type": "content_block_stop", "index": 0})
                                content_block_started = False

                            tool_calls_buffer[idx] = {
                                "id": tc.id or f"toolu_{idx}",
                                "name": tc.function.name if tc.function and tc.function.name else "",
                                "arguments": ""
                            }

                            block_index = idx + (1 if text_started else 0)
                            self._write_sse({
                                "type": "content_block_start",
                                "index": block_index,
                                "content_block": {
                                    "type": "tool_use",
                                    "id": tool_calls_buffer[idx]["id"],
                                    "name": tool_calls_buffer[idx]["name"],
                                    "input": {}
                                }
                            })

                        if tc.function and tc.function.arguments:
                            tool_calls_buffer[idx]["arguments"] += tc.function.arguments
                            block_index = idx + (1 if text_started else 0)
                            self._write_sse({
                                "type": "content_block_delta",
                                "index": block_index,
                                "delta": {
                                    "type": "input_json_delta",
                                    "partial_json": tc.function.arguments
                                }
                            })

                # Handle finish
                if finish_reason:
                    # Close any open blocks
                    if content_block_started:
                        self._write_sse({"type": "content_block_stop", "index": 0})

                    for idx in sorted(tool_calls_buffer.keys()):
                        block_index = idx + (1 if text_started else 0)
                        self._write_sse({"type": "content_block_stop", "index": block_index})

                    stop_reason = "end_turn"
                    if finish_reason == "tool_calls":
                        stop_reason = "tool_use"
                    elif finish_reason == "length":
                        stop_reason = "max_tokens"

                    self._write_sse({
                        "type": "message_delta",
                        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                        "usage": {"output_tokens": 0}
                    })
                    self._write_sse({"type": "message_stop"})

        except Exception as e:
            print(f"[proxy] Stream error: {e}", flush=True)
            # Try to send error event
            try:
                self._write_sse({
                    "type": "error",
                    "error": {"type": "server_error", "message": str(e)}
                })
            except:
                pass

    def _handle_chat_completions(self, body):
        """Pass through OpenAI chat/completions format"""
        model_name = body.get("model", "")
        litellm_model = MODELS.get(model_name)
        if not litellm_model:
            self._send_json(400, {"error": f"Unknown model: {model_name}"})
            return

        # Per-request API key override
        provider_key = self.headers.get("x-provider-key")

        try:
            kwargs = {
                "model": litellm_model,
                "messages": body.get("messages", []),
                "max_tokens": body.get("max_tokens", 4096),
                "temperature": body.get("temperature", 1.0),
                "drop_params": True,
            }
            if provider_key:
                kwargs["api_key"] = provider_key
            resp = litellm.completion(**kwargs)
            self._send_json(200, resp.model_dump())
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _write_sse(self, data):
        line = f"event: {data['type']}\ndata: {json.dumps(data)}\n\n"
        self.wfile.write(line.encode())
        self.wfile.flush()


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    print(f"[proxy] Starting on port {PORT}", flush=True)
    print(f"[proxy] Models: {list(MODELS.keys())}", flush=True)
    server = ThreadedHTTPServer(("0.0.0.0", PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[proxy] Shutting down", flush=True)
        server.server_close()
