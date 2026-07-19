import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-80 (failure-states-lie): after sub-fix (b) made dead sticky and
 * role/description preserve-first, the UpdateGraphEntity agent tool — advertised
 * as "Create or update entities … properties (role, description, etc.)" — began
 * silently no-op'ing deliberate corrections (dead→alive, role/description edits)
 * while still reporting "1 updated". A user/agent DELIBERATE edit must always be
 * honoured; only STOCHASTIC re-extraction is sticky.
 *
 * Fix: `upsertEntities(result, authoritative)` gained an `authoritative` flag
 * (default false). executeUpdateGraphEntity passes `true`, so the sticky/
 * preserve-first clauses are bypassed and the correction lands. This test pins
 * the WIRING (the tool calls the upsert authoritatively); the behavioural proof
 * that authoritative bypasses stickiness lives in
 * graph-entity-property-monotonic.test.ts (d80-1..d80-3).
 */

const upsertMock = vi.hoisted(() =>
  vi.fn(async () => ({ nodesCreated: 0, nodesUpdated: 1, relationshipsCreated: 0 }))
);

// tools.ts pulls heavy seams at module load (Prisma, Neo4j, OpenAI, Redis).
// Mock every non-type import so the module under test loads side-effect free.
vi.mock("@/lib/graph/graph-builder", () => ({ upsertEntities: upsertMock }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    constructor(..._args: unknown[]) {}
  },
}));
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
vi.mock("@/lib/agents/definitions", () => ({ getAgentDefinition: vi.fn() }));
vi.mock("@/lib/agents/prompt-assembler", () => ({ assembleAgentPrompt: vi.fn() }));
vi.mock("@/lib/agents/post-session", () => ({ processPostSession: vi.fn() }));
vi.mock("@/lib/agents/session-manager", () => ({ getSession: vi.fn() }));

import { executeTool, type ToolContext } from "@/lib/agents/tools";

const ctx = {
  bookId: "book-1",
  userId: "user-1",
  sessionId: "sess-1",
  agentType: "dev-editor",
} as unknown as ToolContext;

beforeEach(() => {
  upsertMock.mockClear();
});

describe("D-80: UpdateGraphEntity performs an AUTHORITATIVE upsert", () => {
  it("passes authoritative=true so a deliberate correction is not silently dropped by sticky/preserve-first", async () => {
    const out = await executeTool("UpdateGraphEntity", ctx, {
      entities: [
        { type: "Character", name: "Corvin", properties: { status: "alive", role: "ally" } },
      ],
      chapterNumber: 7,
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [result, authoritative] = upsertMock.mock.calls[0] as unknown as [
      { bookId: string; entities: unknown[]; chapterNumber: number },
      boolean,
    ];
    expect(authoritative).toBe(true);

    // sanity: the correction reached the upsert, book-scoped (D-30 intact)
    expect(result.bookId).toBe("book-1");
    expect(result.entities).toHaveLength(1);
    expect(result.chapterNumber).toBe(7);

    // the tool still reports its result string (honest count from the upsert)
    expect(out).toContain("updated");
  });
});
