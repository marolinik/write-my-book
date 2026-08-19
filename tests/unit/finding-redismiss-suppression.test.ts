import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-13: dev-editor re-flags dismissed, memory-backed findings.
 *
 * Live-proven: the writer dismissed a finding (with a linked WriterMemory
 * constraint) and the next dev-edit produced a NEW finding with BYTE-IDENTICAL
 * originalText, same category, same severity — despite the prompt's FINDING
 * HISTORY AWARENESS rule ("If an issue was [DISMISSED] ... do not re-flag
 * UNLESS it's critical"). The content-hash dedup hashes the freshly-generated
 * DESCRIPTION, so a re-worded description structurally evades it.
 *
 * These tests pin the deterministic persist-time guard: a non-critical finding
 * whose originalText (whitespace-normalized) matches a prior DISMISSED finding
 * of the same category on the same book+chapter is suppressed, never persisted.
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
// tools.ts pulls heavy seams at module load (Prisma, Neo4j, OpenAI, Redis).
// Mock every non-type import so the module under test loads side-effect free.
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

// ── Fixtures ──────────────────────────────────────────────────────────────

const SENTENCE = "The rain fell in long grey ribbons over the harbor.";
const CHAPTER_CONTENT = `${SENTENCE} She watched it from the window.\n\nHe said nothing, and the silence stretched between them.`;

const ctx = {
  bookId: "book-1",
  userId: "user-1",
  sessionId: "sess-1",
  agentType: "dev-editor",
  documentService: {
    findByType: vi.fn().mockResolvedValue({ id: "doc-1", currentVersion: 3 }),
    read: vi.fn().mockResolvedValue({ content: CHAPTER_CONTENT }),
  },
} as unknown as ToolContext;

function findingInput(overrides: Record<string, unknown> = {}) {
  return {
    chapterNumber: 1,
    severity: "suggestion",
    category: "prose",
    description: "Consider varying the sentence rhythm in this opening image.",
    rationale: "The rhythm is monotone across the paragraph.",
    confidence: 0.8,
    paragraphNumber: 1,
    anchorQuote: SENTENCE,
    alternatives: [
      { label: "Tighter", originalText: SENTENCE, newText: "Rain ribboned grey over the harbor." },
      { label: "Softer", originalText: SENTENCE, newText: "Grey rain fell over the harbor in ribbons." },
    ],
    ...overrides,
  };
}

interface DismissedSeed {
  id: string;
  bookId: string;
  chapterNumber: number;
  category: string;
  status: string;
  originalText: string | null;
}

/** Emulate the Prisma where-clause so chapter/category scoping is really exercised. */
function seedFindings(rows: DismissedSeed[]) {
  h.db.editFinding.findMany.mockImplementation(
    async (args: {
      where: {
        bookId: string;
        chapterNumber: number;
        category: string;
        status: string;
        originalText?: { not: null };
      };
    }) =>
      rows
        .filter(
          (r) =>
            r.bookId === args.where.bookId &&
            r.chapterNumber === args.where.chapterNumber &&
            r.category === args.where.category &&
            r.status === args.where.status &&
            (args.where.originalText?.not !== null || r.originalText !== null)
        )
        .map((r) => ({ id: r.id, originalText: r.originalText }))
  );
}

function dismissed(overrides: Partial<DismissedSeed> = {}): DismissedSeed {
  return {
    id: "dismissed-1",
    bookId: "book-1",
    chapterNumber: 1,
    category: "prose",
    status: "dismissed",
    originalText: SENTENCE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.db.chapter.findFirst.mockResolvedValue({ id: "ch-row-1", chapterNumber: 1 });
  h.db.editFinding.findFirst.mockResolvedValue(null); // no content-hash duplicate
  h.db.editFinding.findMany.mockResolvedValue([]);
  h.db.editFinding.create.mockResolvedValue({ id: "new-finding-1" });
  (ctx.documentService.findByType as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "doc-1",
    currentVersion: 3,
  });
  (ctx.documentService.read as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: CHAPTER_CONTENT,
  });
});

describe("CreateFinding: dismissed-finding re-flag suppression (D-13)", () => {
  it("(a) suppresses a re-raised finding with identical originalText+category on a dismissed one", async () => {
    // Trailing whitespace on the stored row: match must be whitespace-normalized.
    seedFindings([dismissed({ originalText: `${SENTENCE}\n` })]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toMatch(/suppressed/i);
    expect(result).toContain("dismissed-1");
    expect(h.db.editFinding.create).not.toHaveBeenCalled();
  });

  it("(b) allows a critical-severity finding through even on dismissed text", async () => {
    seedFindings([dismissed()]);

    const result = await executeTool(
      "CreateFinding",
      ctx,
      findingInput({ severity: "critical" })
    );

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });

  it("(c) allows a finding whose originalText differs from the dismissed one", async () => {
    seedFindings([
      dismissed({ originalText: "He said nothing, and the silence stretched between them." }),
    ]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });

  it("(d) never suppresses on empty originalText, even when a dismissed row is also empty", async () => {
    seedFindings([dismissed({ originalText: "" })]);

    const result = await executeTool(
      "CreateFinding",
      ctx,
      findingInput({
        alternatives: [
          { label: "Tighter", originalText: "", newText: "Rain ribboned grey over the harbor." },
          { label: "Softer", originalText: "", newText: "Grey rain fell in ribbons." },
        ],
      })
    );

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });

  it("(e) allows the same text+category when the dismissal was on a DIFFERENT chapter", async () => {
    seedFindings([dismissed({ chapterNumber: 2 })]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });
});
