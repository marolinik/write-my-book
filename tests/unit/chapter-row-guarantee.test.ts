/**
 * SIM-01 (persona campaign): a chapter whose CONTENT an agent produced
 * (write-chapter / revise) must exist as a Chapter row — otherwise chapter
 * lists, book word counts, and exports silently skip the new text (the
 * campaign's ghostwritten 4,200-word chapter was invisible to export).
 * H4: revise runs count a revision instead of leaving revisionCount frozen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirstDocument = vi.fn();
const findFirstChapter = vi.fn();
const createChapter = vi.fn();
const updateChapter = vi.fn();
const readDocument = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    document: { findFirst: (...a: unknown[]) => findFirstDocument(...a) },
    chapter: {
      findFirst: (...a: unknown[]) => findFirstChapter(...a),
      create: (...a: unknown[]) => createChapter(...a),
      update: (...a: unknown[]) => updateChapter(...a),
      aggregate: vi.fn().mockResolvedValue({ _sum: { wordCount: 0 } }),
    },
    book: { update: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}));

// The module under test imports many heavy deps; stub everything except the
// ensureChapterRow path.
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    read = (...a: unknown[]) => readDocument(...a);
  },
}));
vi.mock("@/lib/graph/graph-maintenance", () => ({ updateFromChapter: vi.fn() }));
vi.mock("@/lib/agents/extraction-keys", () => ({ getExtractionKeysForUser: vi.fn() }));
vi.mock("@/lib/vector/memory-manager", () => ({
  onSessionCompleted: vi.fn(),
  onDocumentChanged: vi.fn(),
  onFindingsCreated: vi.fn(),
}));
vi.mock("@/lib/agents/blackboard", () => ({ promoteFindings: vi.fn() }));
vi.mock("@/lib/series/series-synthesizer", () => ({ synthesizeToSeries: vi.fn() }));
vi.mock("@/lib/agents/workflows", () => ({ getWorkflow: vi.fn().mockReturnValue(undefined) }));
vi.mock("@/lib/agents/prerequisites", () => ({ validatePrerequisites: vi.fn().mockResolvedValue({ satisfied: true, missing: [] }) }));
vi.mock("@/lib/agents/artifact-contract", () => ({
  evaluateArtifactContract: vi.fn().mockResolvedValue(undefined),
  filterBlockedNextSteps: vi.fn(async (next: string[]) => next),
}));

const { processPostSession } = await import("@/lib/agents/post-session");

const baseCtx = {
  sessionId: "s1",
  bookId: "b1",
  userId: "u1",
  agentType: "ghostwriter",
  workflowId: "write-chapter",
  chapterNumber: 3,
  documentIds: [],
  assistantText: "",
};

describe("SIM-01: ensureChapterRow on write-chapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstDocument.mockResolvedValue({ id: "doc1", title: "The Arithmetic of Tides" });
    readDocument.mockResolvedValue({ content: "one two three four five" });
    findFirstChapter.mockResolvedValue(null);
    createChapter.mockResolvedValue({});
    updateChapter.mockResolvedValue({});
  });

  it("creates the missing Chapter row with title + word count", async () => {
    await processPostSession(baseCtx as never);
    expect(createChapter).toHaveBeenCalledTimes(1);
    const arg = createChapter.mock.calls[0][0].data;
    expect(arg.bookId).toBe("b1");
    expect(arg.chapterNumber).toBe(3);
    expect(arg.title).toBe("The Arithmetic of Tides");
    expect(arg.wordCount).toBe(5);
    expect(arg.status).toBe("drafted");
  });

  it("does nothing when no chapter content document exists", async () => {
    findFirstDocument.mockResolvedValue(null);
    await processPostSession(baseCtx as never);
    expect(createChapter).not.toHaveBeenCalled();
  });

  it("updates an existing row (word count sync) instead of creating", async () => {
    findFirstChapter.mockResolvedValue({ id: "c1", title: "Existing" });
    await processPostSession(baseCtx as never);
    expect(createChapter).not.toHaveBeenCalled();
    expect(updateChapter).toHaveBeenCalledTimes(1);
    expect(updateChapter.mock.calls[0][0].data.wordCount).toBe(5);
  });

  it("increments revisionCount on revise (H4)", async () => {
    findFirstChapter.mockResolvedValue({ id: "c1", title: "Existing" });
    await processPostSession({ ...baseCtx, workflowId: "revise" } as never);
    expect(updateChapter.mock.calls[0][0].data.revisionCount).toEqual({ increment: 1 });
  });

  it("does not touch chapters for non-content workflows", async () => {
    await processPostSession({ ...baseCtx, workflowId: "dev-edit", documentIds: [] } as never);
    expect(findFirstDocument).not.toHaveBeenCalled();
  });
});
