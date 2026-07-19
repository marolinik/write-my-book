import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Wiring tests: the editorial-text-hygiene sanitizers are applied at the write
 * boundary, so the writer never receives the raw model artifacts.
 *
 * D-49 (P6 Owen func #3): a finding rationale that fabricates a verbatim
 * quotation of the fingerprint is de-quoted before persistence.
 * D-50 (P6 Owen func #4): model self-talk is stripped from the finding
 * rationale/description AND from the writer-facing *_EDIT_REPORT document.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    // WriteDocument runs its body inside db.$transaction(fn) → fn(tx).
    $transaction: vi.fn(),
    document: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
// Mock every heavy seam tools.ts pulls at module load (mirrors finding-input-validation).
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
vi.mock("@/lib/graph/graph-builder", () => ({ upsertEntities: vi.fn() }));
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

const ANCHOR =
  "She counted the tide-marks on the seawall the way she counted everything, as if arithmetic could hold the water back.";

const CHAPTER_CONTENT = [
  "The morning tide had left the flats bare and shining.",
  ANCHOR,
  "By the time she reached the seawall the light had gone flat and pewter.",
].join("\n\n");

const FINGERPRINT =
  "Voice: long, accretive sentences with and-stacked clauses. Register is " +
  "coastal and sensory. The narrator infers rather than states.";

const ALTERNATIVES = [
  { label: "Option A", originalText: ANCHOR, newText: "She counted the tide-marks as if arithmetic could hold the water back." },
  { label: "Option B", originalText: ANCHOR, newText: "She counted the tide-marks, holding the water back with numbers." },
];

function docCtx() {
  return {
    bookId: "book-1",
    userId: "user-1",
    sessionId: "sess-1",
    agentType: "line-editor",
    documentService: {
      findByType: vi.fn(async (type: string) =>
        type === "FINGERPRINT"
          ? { id: "fp-doc", currentVersion: 1 }
          : { id: "chapter-doc", currentVersion: 3 }
      ),
      read: vi.fn(async (id: string) =>
        id === "fp-doc" ? { content: FINGERPRINT } : { content: CHAPTER_CONTENT }
      ),
      create: vi.fn(async () => ({ id: "new-doc", version: { version: 1 } })),
      update: vi.fn(async () => ({ id: "existing-doc", version: { version: 2 } })),
    },
    chapterNumber: 1,
  } as unknown as ToolContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findFirst.mockResolvedValue({ id: "ch-row-1", chapterNumber: 1 });
  h.db.editFinding.findFirst.mockResolvedValue(null);
  h.db.editFinding.findMany.mockResolvedValue([]);
  h.db.editFinding.create.mockResolvedValue({ id: "new-finding-1" });
  h.db.document.findFirst.mockResolvedValue(null); // WriteDocument → create path
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ document: h.db.document })
  );
});

describe("CreateFinding sanitizes writer-facing text (D-49 + D-50)", () => {
  it("de-quotes a fabricated fingerprint citation and strips self-talk from the rationale", async () => {
    const ctx = docCtx();
    const result = await executeTool("CreateFinding", ctx, {
      chapterNumber: 1,
      severity: "important",
      category: "voice",
      description: "The line states the counting instead of enacting it.",
      rationale:
        'Hmm, this reads flat (— wait, no, it reads rushed) because the fingerprint calls the voice "clipped, procedural, emotionally controlled" and the sentence lands nowhere.',
      confidence: 0.8,
      paragraphNumber: 2,
      anchorQuote: ANCHOR,
      alternatives: ALTERNATIVES,
    });

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
    const persisted = h.db.editFinding.create.mock.calls[0][0].data;

    // D-50: no self-talk survives.
    expect(persisted.rationale).not.toMatch(/wait, no/i);
    expect(persisted.rationale).not.toMatch(/^\s*Hmm,/i);
    // D-49: the fabricated fingerprint quote loses its quotation marks...
    expect(persisted.rationale).not.toContain('"clipped, procedural, emotionally controlled"');
    // ...but the sentence text itself survives (de-quote, not delete).
    expect(persisted.rationale).toContain("clipped, procedural, emotionally controlled");
    // Legacy suggestion mirror is sanitized too.
    expect(persisted.suggestion).toBe(persisted.rationale);
  });

  it("preserves a genuine, verifiable fingerprint quote", async () => {
    const ctx = docCtx();
    await executeTool("CreateFinding", ctx, {
      chapterNumber: 1,
      severity: "suggestion",
      category: "voice",
      description: "Honor the accretive rhythm.",
      rationale:
        'The fingerprint names "long, accretive sentences with and-stacked clauses" — lean into that here.',
      confidence: 0.7,
      paragraphNumber: 2,
      anchorQuote: ANCHOR,
      alternatives: ALTERNATIVES,
    });

    const persisted = h.db.editFinding.create.mock.calls[0][0].data;
    expect(persisted.rationale).toContain('"long, accretive sentences with and-stacked clauses"');
  });
});

describe("WriteDocument strips self-talk from writer-facing reports (D-50)", () => {
  it("sanitizes a LINE_EDIT_REPORT before persisting", async () => {
    const ctx = docCtx();
    await executeTool("WriteDocument", ctx, {
      documentType: "LINE_EDIT_REPORT",
      content:
        "## Summary\nThe pacing sags mid-chapter (— wait, no, those are short) and the dialogue is strong.",
      chapterNumber: 1,
    });

    const createMock = ctx.documentService.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledTimes(1);
    const writtenContent = createMock.mock.calls[0][1] as string;
    expect(writtenContent).not.toMatch(/wait, no/i);
    expect(writtenContent).toContain("The pacing sags mid-chapter and the dialogue is strong.");
  });

  it("does NOT sanitize non-report documents (chapter content is the writer's own)", async () => {
    const ctx = docCtx();
    const chapterProse =
      "He paused. (— wait, that's how she'd say it, not him —) and said nothing.";
    await executeTool("WriteDocument", ctx, {
      documentType: "CHAPTER_CONTENT",
      content: chapterProse,
      chapterNumber: 1,
    });

    const createMock = ctx.documentService.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][1]).toBe(chapterProse);
  });
});
