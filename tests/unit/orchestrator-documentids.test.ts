import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentSpawnOptions, AgentStreamMessage } from "@/lib/agents/types";

/**
 * D-58 (failure-states-lie / setup-completion honesty): a completion must report
 * the documents the run actually produced. The plumbing was already in place —
 * runAgent/continueConversation own a `documentIds: string[]`, return it in
 * AgentResult, and the worker threads it into the "complete" SSE — but the
 * SOURCE was never populated: `AgentResult.documentIds` was always []. Every
 * `WriteDocument` id was dropped, so a setup/onboarding run reported [] despite
 * writing the story bible.
 *
 * Fix: `executeWriteDocument` records each created OR updated document id on a
 * new `ToolContext.documentIds` sink that runAgent/continueConversation wire to
 * the array they return. This test drives the REAL orchestrator + the REAL
 * `executeWriteDocument` (only PERSISTENCE — db.$transaction + DocumentService —
 * is stubbed to hand back a known id) and asserts the id surfaces on
 * `result.documentIds`. It deliberately does NOT mock `@/lib/agents/tools`: a
 * test that stubs the orchestrator's own result (or the whole tool layer) would
 * be vacuous — it would pass no matter whether the sink is wired.
 *
 * Created AND updated are both recorded: the metadata answers "which documents
 * did this session produce", and an update produces a new version of a document
 * just as a create does. No current consumer distinguishes the two, and honest
 * re-run/editorial reporting needs updates too.
 */

const h = vi.hoisted(() => ({
  // Persistence seam for executeWriteDocument's create/update paths.
  txFindFirst: vi.fn(async (): Promise<null | { id: string }> => null),
  docCreate: vi.fn(async () => ({ id: "doc-created-1" })),
  docUpdate: vi.fn(async () => ({ version: { version: 2 } })),
  // Agent-definition / prompt seams (as in orchestrator-provider-failure.test).
  getAgentDefinition: vi.fn(() => ({ tools: ["WriteDocument"] })),
  assembleAgentPrompt: vi.fn(async () => "SYSTEM PROMPT"),
}));

// ── Persistence stubs — hand back known ids so the real executeWriteDocument
// records them without touching a database. ─────────────────────────────────
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ document: { findFirst: h.txFindFirst } }),
  },
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    constructor(..._args: unknown[]) {}
    create = h.docCreate;
    update = h.docUpdate;
    findByType = vi.fn(async () => null);
    read = vi.fn(async () => null);
  },
}));

// ── Heavy seams tools.ts pulls at module load (Prisma/Neo4j/OpenAI/Redis) —
// mock so the REAL tools module (and thus real executeWriteDocument) loads
// side-effect free. Mirrors updategraphentity-authoritative.test.ts. ─────────
vi.mock("@/lib/graph/graph-builder", () => ({ upsertEntities: vi.fn() }));
vi.mock("@/lib/graph/graph-queries", () => ({
  getCharacterNetwork: vi.fn(),
  getTimeline: vi.fn(),
  getLocationMap: vi.fn(),
  getPlotThreads: vi.fn(),
  getChapterEntities: vi.fn(),
  runConsistencyChecks: vi.fn(),
}));
vi.mock("@/lib/vector/retriever", () => ({
  searchMemory: vi.fn(),
  formatSearchResults: vi.fn(),
}));
vi.mock("@/lib/vector/indexer", () => ({ indexDocument: vi.fn() }));
vi.mock("@/lib/agents/blackboard", () => ({
  getRelevantInsights: vi.fn(),
  createInsight: vi.fn(),
  resolveInsight: vi.fn(),
}));
vi.mock("@/lib/agents/definitions", () => ({
  getAgentDefinition: h.getAgentDefinition,
}));
vi.mock("@/lib/agents/prompt-assembler", () => ({
  assembleAgentPrompt: h.assembleAgentPrompt,
}));
vi.mock("@/lib/agents/post-session", () => ({ processPostSession: vi.fn() }));
vi.mock("@/lib/agents/session-manager", () => ({ getSession: vi.fn() }));

import { AgentOrchestrator } from "@/lib/agents/orchestrator";

// ── Fake model response building (same shape as orchestrator-provider-failure) ─
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

function makeStream(m: FakeMessage) {
  return {
    async *[Symbol.asyncIterator]() {
      /* no streamed events */
    },
    finalMessage: async () => m as unknown as Anthropic.Message,
  };
}

function makeClient(script: FakeMessage[]) {
  let call = 0;
  const stream = vi.fn((_params: unknown, _opts: unknown) =>
    makeStream(script[Math.min(call++, script.length - 1)])
  );
  return { client: { messages: { stream } } as unknown as Anthropic };
}

/** A WriteDocument tool_use turn followed by a natural end_turn. */
function writeThenFinish(input: Record<string, unknown>): FakeMessage[] {
  return [
    msg([{ type: "tool_use", id: "t0", name: "WriteDocument", input }], 20, "tool_use"),
    msg([{ type: "text", text: "Done." }], 5, "end_turn"),
  ];
}

function buildOptions(overrides?: Partial<AgentSpawnOptions>) {
  const captured: AgentStreamMessage[] = [];
  const options: AgentSpawnOptions = {
    agentType: "story-architect",
    model: "sonnet",
    context: { bookId: "b1", userId: "u1", language: "en" },
    workflowId: "setup-bible",
    sessionId: `s_${id}`,
    onMessage: (m) => captured.push(m),
    onComplete: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { options, captured };
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
  h.txFindFirst.mockResolvedValue(null);
  h.docCreate.mockResolvedValue({ id: "doc-created-1" });
  h.docUpdate.mockResolvedValue({ version: { version: 2 } });
  h.getAgentDefinition.mockReturnValue({ tools: ["WriteDocument"] });
  h.assembleAgentPrompt.mockResolvedValue("SYSTEM PROMPT");
});

describe("AgentOrchestrator — WriteDocument populates result.documentIds (D-58)", () => {
  it("records a CREATED document's id on the returned AgentResult", async () => {
    // Persistence: no existing doc → create path returns a known id.
    h.txFindFirst.mockResolvedValue(null);
    h.docCreate.mockResolvedValue({ id: "doc-created-1" });

    const { client } = makeClient(
      writeThenFinish({ documentType: "STORY_BIBLE", content: "The bible." })
    );

    const result = await makeOrchestrator(client).runAgent(buildOptions().options);

    expect(result.success).toBe(true);
    // The RED assertion pre-fix: documentIds is [] because the sink is unwired.
    expect(result.documentIds).toContain("doc-created-1");
  });

  it("records an UPDATED document's id too (created AND updated are 'produced')", async () => {
    // Persistence: an existing doc of this type → update path.
    h.txFindFirst.mockResolvedValue({ id: "doc-existing-9" });
    h.docUpdate.mockResolvedValue({ version: { version: 3 } });

    const { client } = makeClient(
      writeThenFinish({ documentType: "STORY_BIBLE", content: "Revised bible." })
    );

    const result = await makeOrchestrator(client).runAgent(buildOptions().options);

    expect(result.success).toBe(true);
    expect(result.documentIds).toContain("doc-existing-9");
  });

  it("continueConversation also records produced document ids", async () => {
    h.txFindFirst.mockResolvedValue(null);
    h.docCreate.mockResolvedValue({ id: "doc-conv-7" });

    const onComplete = vi.fn();
    const { options } = buildOptions({ onComplete });
    const { client } = makeClient(
      writeThenFinish({ documentType: "STORY_BIBLE", content: "From a conversation." })
    );

    await makeOrchestrator(client).continueConversation(options, [], "write the bible");

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].documentIds).toContain("doc-conv-7");
  });

  it("delegation aggregation now collects the specialist's real document ids", async () => {
    // The specialist runAgent populates its OWN documentIds via the same sink;
    // the delegation collector (tools.ts) push-spreads result.documentIds. This
    // asserts the source that feeds that aggregation is non-empty.
    h.txFindFirst.mockResolvedValue(null);
    h.docCreate.mockResolvedValue({ id: "doc-specialist-3" });

    const { client } = makeClient(
      writeThenFinish({ documentType: "STORY_BIBLE", content: "Specialist output." })
    );

    const result = await makeOrchestrator(client).runAgent(buildOptions().options);

    // A specialist's AgentResult.documentIds is exactly what the delegation
    // collector spreads — so a non-empty result here means the aggregation at
    // tools.ts (specialistDocumentIds.push(...result.documentIds)) collects reals.
    expect(result.documentIds).toEqual(["doc-specialist-3"]);
  });
});
