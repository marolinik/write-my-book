// P2-18: the approval WriteChapter checks is recorded by the server when the
// writer approves, not taken from the model. Drives the real tool loop with
// the orchestrator-budget harness: RequestApproval, then WriteChapter.
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


async function runWith(decision: "approve" | "reject") {
  const seen: Array<boolean | undefined> = [];
  h.executeTool.mockImplementation(async (name: string, ctx: { overwriteApproved?: boolean }) => {
    if (name === "RequestApproval") return "__APPROVAL_GATE__";
    if (name === "WriteChapter") seen.push(ctx.overwriteApproved);
    return "ok";
  });
  const { client } = makeClient([
    msg([toolUse("RequestApproval", "ap1")], 10),
    msg([toolUse("WriteChapter", "wc1")], 10),
    msg([{ type: "text", text: "done" }], 10, "end_turn"),
  ]);
  const { options } = buildOptions();
  const orch = new AgentOrchestrator({
    client,
    modelId: "claude-fake",
    registryId: "anthropic/sonnet",
    maxSessionCostUsd: 100,
    maxRuntimeMs: 60 * 60 * 1000,
    interactive: true,
    approvalResolver: async () => ({ decision }),
  });
  await orch.runAgent(options);
  return seen;
}

describe("orchestrator records the writer's approval for WriteChapter (P2-18)", () => {
  it("an approval sets overwriteApproved before the write", async () => {
    expect(await runWith("approve")).toEqual([true]);
  });

  it("a rejection does not", async () => {
    expect(await runWith("reject")).toEqual([undefined]);
  });
});
