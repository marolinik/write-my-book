import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentSpawnOptions, AgentStreamMessage } from "@/lib/agents/types";

/**
 * D-36 (queue-state honesty): a provider failure mid-session must NOT resolve
 * as a clean completion. Before the fix, the tool-loop's provider-error catch
 * emitted an SSE "error" and then `break`-ed — the loop returned normally with
 * endReason "natural", runAgent hardcoded success:true, and onComplete marked
 * the session "completed" with 0 tokens / $0 (P6 Owen C-2: a REAL OpenRouter
 * outage mid line-edit produced completed/natural/0-tokens and advanced the
 * chapter to line_edited).
 *
 * These tests drive the REAL AgentOrchestrator + the REAL retry-handler
 * (withProviderRetry / ProviderError) with a fake model client, asserting:
 *   (1) a provider error that ends the loop resolves success:false with
 *       endReason "error" — via onComplete (NOT onError) so token/cost
 *       accounting still persists;
 *   (2) a hollow "200 with zero work" first-turn response (outage shape some
 *       gateways produce) is also classified as a provider failure;
 *   (3) a legitimately-cheap session (few tokens, real text) stays completed —
 *       classification keys on the error/empty-work signal, NOT token count;
 *   (4) partial spend already streamed on the failing turn is still counted
 *       (money honesty).
 *
 * Same mock seams as orchestrator-budget.test.ts: only tools/prompt/doc-service
 * /cost are mocked; the loop control flow and retry-handler run for real.
 */

const h = vi.hoisted(() => ({
  executeTool: vi.fn(),
  getToolDefinitions: vi.fn(),
  assembleAgentPrompt: vi.fn(),
  estimateCost: vi.fn(),
  getAgentDefinition: vi.fn(),
}));

vi.mock("@/lib/agents/tools", () => ({
  APPROVAL_SENTINEL: "__APPROVAL_GATE__",
  executeTool: h.executeTool,
  getToolDefinitions: h.getToolDefinitions,
}));
vi.mock("@/lib/agents/prompt-assembler", () => ({
  assembleAgentPrompt: h.assembleAgentPrompt,
}));
vi.mock("@/lib/agents/definitions", () => ({
  getAgentDefinition: h.getAgentDefinition,
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    constructor(..._args: unknown[]) {}
  },
}));
vi.mock("@/lib/cost", () => ({
  estimateCost: h.estimateCost,
}));

import { AgentOrchestrator } from "@/lib/agents/orchestrator";

// ── Fake model response building ──────────────────────────────────────────
type FakeBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

interface FakeMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: FakeBlock[];
  stop_reason: "tool_use" | "end_turn" | "max_tokens";
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
}

let id = 0;
function msg(
  content: FakeBlock[],
  outputTokens: number,
  stop_reason: FakeMessage["stop_reason"] = "tool_use",
  inputTokens = 10
): FakeMessage {
  return {
    id: `m_${id++}`,
    type: "message",
    role: "assistant",
    model: "fake",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/** A stream that yields no events but resolves finalMessage() to the script. */
function makeStream(m: FakeMessage) {
  return {
    async *[Symbol.asyncIterator]() {
      /* no streamed events */
    },
    finalMessage: async () => m as unknown as Anthropic.Message,
  };
}

/** A stream that yields usage events, then dies mid-stream with `error`. */
function makeDyingStream(
  events: Array<Record<string, unknown>>,
  error: unknown
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
      throw error;
    },
    finalMessage: async () => {
      throw error;
    },
  };
}

/**
 * Script entries are either a FakeMessage (turn succeeds) or a thunk that
 * returns a stream (turn behaves however the thunk decides — e.g. throws).
 */
type ScriptEntry = FakeMessage | (() => unknown);

function makeClient(script: ScriptEntry[]) {
  let call = 0;
  const stream = vi.fn((_params: unknown, _opts: unknown) => {
    const entry = script[Math.min(call++, script.length - 1)];
    return typeof entry === "function" ? entry() : makeStream(entry);
  });
  const client = { messages: { stream } } as unknown as Anthropic;
  return { client, stream };
}

/** Provider-outage-shaped error: non-retryable status → immediate ProviderError.
 * (A 5xx outage exhausts withProviderRetry's backoff and lands in the SAME
 * orchestrator catch — 402 just gets there without 100s of backoff sleeps.) */
function providerError(status = 402): Error {
  return Object.assign(new Error(`Provider failure (${status})`), { status });
}

function buildOptions(overrides?: Partial<AgentSpawnOptions>) {
  const captured: AgentStreamMessage[] = [];
  const onComplete = vi.fn();
  const onError = vi.fn();
  const options: AgentSpawnOptions = {
    agentType: "line-editor",
    model: "sonnet",
    context: { bookId: "b1", userId: "u1", language: "en" },
    workflowId: "line-edit",
    sessionId: "s1",
    onMessage: (m) => captured.push(m),
    onComplete,
    onError,
    ...overrides,
  };
  return { options, captured, onComplete, onError };
}

function makeOrchestrator(client: Anthropic) {
  return new AgentOrchestrator({
    client,
    modelId: "claude-fake",
    registryId: "anthropic/sonnet",
    maxSessionCostUsd: 10,
    maxRuntimeMs: 60 * 60 * 1000,
    providerKey: "openrouter",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  id = 0;
  h.getAgentDefinition.mockReturnValue({ tools: [] });
  h.getToolDefinitions.mockReturnValue([]);
  h.assembleAgentPrompt.mockResolvedValue("SYSTEM PROMPT");
  h.executeTool.mockResolvedValue("ok");
  h.estimateCost.mockImplementation(
    (_model: string, _inTok: number, outTok: number) => outTok / 1000
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgentOrchestrator — provider failure classification (D-36)", () => {
  it("a first-turn provider failure resolves FAILED (success:false, endReason 'error'), not completed/natural", async () => {
    const { client } = makeClient([() => {
      throw providerError(402);
    }]);
    const { options, captured, onComplete, onError } = buildOptions();

    const result = await makeOrchestrator(client).runAgent(options);

    // The honest terminal SSE error was already the pre-fix behavior — keep it.
    expect(captured.some((m) => m.type === "error")).toBe(true);

    // THE D-36 CLASSIFICATION: zero model work due to provider failure must
    // NOT masquerade as a clean natural completion.
    expect(result.success).toBe(false);
    expect(result.endReason).toBe("error");
    expect(result.tokensInput).toBe(0);
    expect(result.tokensOutput).toBe(0);

    // Resolution still flows through onComplete (so the worker persists
    // tokens/cost and rolls the batch ledger) — NOT through onError.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      success: false,
      endReason: "error",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("a retryable outage (503) that exhausts withProviderRetry resolves FAILED too", async () => {
    vi.useFakeTimers();
    const { client, stream } = makeClient([() => {
      throw providerError(503);
    }]);
    const { options, onComplete, onError } = buildOptions();

    const promise = makeOrchestrator(client).runAgent(options);
    // Drain the 10s/30s/60s retry backoffs deterministically.
    await vi.advanceTimersByTimeAsync(200_000);
    const result = await promise;

    // All 4 attempts (1 + 3 retries) hit the provider, then honest failure.
    expect(stream).toHaveBeenCalledTimes(4);
    expect(result.success).toBe(false);
    expect(result.endReason).toBe("error");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("a hollow zero-work 200 on the first turn (outage shape) is classified as provider failure", async () => {
    // Some gateways surface an outage as a well-formed response with NO
    // content and 0 output tokens — indistinguishable from C-2's
    // completed/0-token/natural signature unless classified here.
    const { client } = makeClient([msg([], 0, "end_turn", 0)]);
    const { options, captured } = buildOptions();

    const result = await makeOrchestrator(client).runAgent(options);

    expect(result.success).toBe(false);
    expect(result.endReason).toBe("error");
    expect(captured.some((m) => m.type === "error")).toBe(true);
  });

  it("a legitimately-cheap session (few tokens, real text) still completes — no token-count heuristic", async () => {
    const { client } = makeClient([msg([{ type: "text", text: "Done." }], 3, "end_turn")]);
    const { options, captured, onError } = buildOptions();

    const result = await makeOrchestrator(client).runAgent(options);

    expect(result.success).toBe(true);
    expect(result.endReason).toBe("natural");
    expect(onError).not.toHaveBeenCalled();
    expect(captured.some((m) => m.type === "error")).toBe(false);
  });

  it("a mid-session provider failure fails the session but keeps the earlier turns' token accounting", async () => {
    const { client } = makeClient([
      msg(
        [{ type: "tool_use", id: "t0", name: "ReadChapter", input: {} }],
        100,
        "tool_use"
      ),
      () => {
        throw providerError(402);
      },
    ]);
    const { options, onComplete } = buildOptions();

    const result = await makeOrchestrator(client).runAgent(options);

    expect(result.success).toBe(false);
    expect(result.endReason).toBe("error");
    // Turn 0's real spend must survive the failure classification.
    expect(result.tokensInput).toBe(10);
    expect(result.tokensOutput).toBe(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("partial spend streamed on the dying turn is still counted (money honesty)", async () => {
    const tracker = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
    };
    const { client } = makeClient([
      () =>
        makeDyingStream(
          [
            {
              type: "message_start",
              message: { usage: { input_tokens: 7, output_tokens: 0 } },
            },
            { type: "message_delta", usage: { output_tokens: 3 } },
          ],
          providerError(402)
        ),
    ]);
    const { options } = buildOptions();
    const orch = new AgentOrchestrator({
      client,
      modelId: "claude-fake",
      registryId: "anthropic/sonnet",
      maxSessionCostUsd: 10,
      maxRuntimeMs: 60 * 60 * 1000,
      providerKey: "openrouter",
      sharedCostTracker: tracker,
    });

    const result = await orch.runAgent(options);

    expect(result.success).toBe(false);
    // The provider billed for the partial turn — record it like the
    // user-cancel abort path already does.
    expect(result.tokensInput).toBe(7);
    expect(result.tokensOutput).toBe(3);
    expect(tracker.totalInputTokens).toBe(7);
    expect(tracker.totalOutputTokens).toBe(3);
  });

  it("continueConversation classifies a provider failure the same way", async () => {
    const { client } = makeClient([() => {
      throw providerError(402);
    }]);
    const { options, onComplete, onError } = buildOptions();

    await makeOrchestrator(client).continueConversation(options, [], "hi");

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      success: false,
      endReason: "error",
    });
    expect(onError).not.toHaveBeenCalled();
  });
});
