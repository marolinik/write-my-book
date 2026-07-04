import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentSpawnOptions, AgentStreamMessage } from "@/lib/agents/types";

/**
 * Integration test for the orchestrator's budget hard-kill path — the top money
 * path (Band C #12). It drives the REAL AgentOrchestrator.runToolLoop with a
 * FAKE model client returning scripted tool_use turns and injected per-turn
 * costs, and asserts the three load-bearing guarantees:
 *
 *   (1) the loop stops within ONE armed wrap-up turn after the cap is crossed;
 *   (2) on that wrap-up turn, allowlisted tools (CreateFinding / WriteDocument /
 *       WriteChapter) still EXECUTE while non-allowlisted (DelegateToSpecialist /
 *       RequestApproval) are SKIPPED;
 *   (3) no exception escapes at the cap (a budget stop is a completion).
 *
 * Only the heavy seams (tools, prompt-assembler, document-service, cost) are
 * mocked; the budget math (src/lib/agents/budget.ts) and the whole tool-loop
 * control flow run for real, so this is a genuine slice, not a tautology.
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
  // Constructed by the orchestrator but never exercised (tools are mocked).
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

function toolUse(name: string, id: string): FakeBlock {
  return { type: "tool_use", id, name, input: {} };
}

function msg(
  content: FakeBlock[],
  outputTokens: number,
  stop_reason: FakeMessage["stop_reason"] = "tool_use"
): FakeMessage {
  return {
    id: `m_${id++}`,
    type: "message",
    role: "assistant",
    model: "fake",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: outputTokens },
  };
}
let id = 0;

/** A stream that yields no events but resolves finalMessage() to the script. */
function makeStream(m: FakeMessage) {
  return {
    async *[Symbol.asyncIterator]() {
      /* no streamed events — the abort path is not under test here */
    },
    finalMessage: async () => m as unknown as Anthropic.Message,
  };
}

function makeClient(script: FakeMessage[]) {
  let call = 0;
  const stream = vi.fn((_params: unknown, _opts: unknown) =>
    makeStream(script[Math.min(call++, script.length - 1)])
  );
  const client = { messages: { stream } } as unknown as Anthropic;
  return { client, stream };
}

function buildOptions(overrides?: Partial<AgentSpawnOptions>) {
  const captured: AgentStreamMessage[] = [];
  const onComplete = vi.fn();
  const onError = vi.fn();
  const options: AgentSpawnOptions = {
    agentType: "ghostwriter",
    model: "sonnet",
    context: { bookId: "b1", userId: "u1", language: "en" },
    workflowId: "write-chapter",
    sessionId: "s1",
    onMessage: (m) => captured.push(m),
    onComplete,
    onError,
    ...overrides,
  };
  return { options, captured, onComplete, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
  id = 0;
  h.getAgentDefinition.mockReturnValue({ tools: [] });
  h.getToolDefinitions.mockReturnValue([]);
  h.assembleAgentPrompt.mockResolvedValue("SYSTEM PROMPT");
  h.executeTool.mockResolvedValue("ok");
  // Cost is a pure function of accumulated output tokens: $1 per 1000 tokens.
  // With a $1.00 cap, cumulative output > 1000 tokens => over budget.
  h.estimateCost.mockImplementation(
    (_model: string, _inTok: number, outTok: number) => outTok / 1000
  );
});

/**
 * Scenario: 3 model turns against a $1.00 cap.
 *  turn 0 — 850 out (cum 850 => $0.85): 80% warning nudge, still under cap.
 *  turn 1 — 400 out (cum 1250 => $1.25): OVER cap on a tool_use turn => arms
 *           the single wrap-up turn.
 *  turn 2 — the armed wrap-up turn: model emits 5 tool_use blocks; only the
 *           3 allowlisted execute, the loop then exits.
 */
function budgetCrossingScript(): FakeMessage[] {
  return [
    msg([{ type: "text", text: "reading" }, toolUse("ReadStoryBible", "t0")], 850),
    msg([toolUse("ReadStoryBible", "t1")], 400),
    msg(
      [
        toolUse("CreateFinding", "wf1"),
        toolUse("WriteDocument", "wd1"),
        toolUse("WriteChapter", "wc1"),
        toolUse("DelegateToSpecialist", "dg1"),
        toolUse("RequestApproval", "ap1"),
      ],
      100
    ),
  ];
}

describe("AgentOrchestrator budget hard-kill", () => {
  it("stops within one wrap-up turn after the cap is crossed, exception-free", async () => {
    const { client, stream } = makeClient(budgetCrossingScript());
    const { options, onComplete, onError, captured } = buildOptions();
    const orch = new AgentOrchestrator({
      client,
      modelId: "claude-fake",
      registryId: "anthropic/sonnet",
      maxSessionCostUsd: 1.0,
      maxRuntimeMs: 60 * 60 * 1000, // large — time limit must NOT fire
    });

    const result = await orch.runAgent(options);

    // (1) One crossing turn (turn 1) + one armed wrap-up turn (turn 2) = 3 model
    // calls total, then the loop exits. No 4th turn.
    expect(stream).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
    expect(result.endReason).toBe("budget");

    // (3) No exception escaped and no SSE "error" was emitted — a budget stop is
    // a graceful completion, not a failure.
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(captured.some((m) => m.type === "error")).toBe(false);

    // The 80% warning nudge fired on the way to the cap.
    expect(captured.some((m) => m.type === "budget_warning")).toBe(true);
    // The crossing turn announced the wrap-up.
    expect(
      captured.some(
        (m) => m.type === "status" && m.metadata?.endReason === "budget"
      )
    ).toBe(true);
  });

  it("executes allowlisted tools but skips non-allowlisted ones on the wrap-up turn", async () => {
    const { client } = makeClient(budgetCrossingScript());
    const { options, captured } = buildOptions();
    const orch = new AgentOrchestrator({
      client,
      modelId: "claude-fake",
      registryId: "anthropic/sonnet",
      maxSessionCostUsd: 1.0,
      maxRuntimeMs: 60 * 60 * 1000,
    });

    await orch.runAgent(options);

    // (2a) Allowlisted persistence tools EXECUTED during wrap-up. These names
    // appear ONLY on the wrap-up turn (turns 0/1 used ReadStoryBible), so a
    // matching executeTool call proves the wrap-up gate ran them.
    const executed = h.executeTool.mock.calls.map((c) => c[0] as string);
    expect(executed).toContain("CreateFinding");
    expect(executed).toContain("WriteDocument");
    expect(executed).toContain("WriteChapter");

    // (2b) Non-allowlisted tools were NEVER executed — they only appear on the
    // wrap-up turn, so their absence proves the gate skipped them.
    expect(executed).not.toContain("DelegateToSpecialist");
    expect(executed).not.toContain("RequestApproval");

    // …and the skipped tools each surfaced a "tool skipped during wrap-up"
    // tool_result so the UI clears their spinners.
    const skipped = captured
      .filter(
        (m) =>
          m.type === "tool_result" &&
          m.content.startsWith("Session ended — tool skipped")
      )
      .map((m) => m.metadata?.tool);
    expect(skipped).toEqual(
      expect.arrayContaining(["DelegateToSpecialist", "RequestApproval"])
    );
  });

  it("does not fire the wrap-up path when spend stays under the cap", async () => {
    // A short natural session: one tool turn, then end_turn. estimateCost keeps
    // cumulative cost well under $1.00, so no budget guard trips.
    const { client, stream } = makeClient([
      msg([toolUse("ReadStoryBible", "t0")], 100),
      msg([{ type: "text", text: "done" }], 100, "end_turn"),
    ]);
    const { options, onError, captured } = buildOptions();
    const orch = new AgentOrchestrator({
      client,
      modelId: "claude-fake",
      registryId: "anthropic/sonnet",
      maxSessionCostUsd: 1.0,
      maxRuntimeMs: 60 * 60 * 1000,
    });

    const result = await orch.runAgent(options);

    expect(stream).toHaveBeenCalledTimes(2);
    expect(result.endReason).toBe("natural");
    expect(onError).not.toHaveBeenCalled();
    expect(captured.some((m) => m.type === "budget_warning")).toBe(false);
  });
});
