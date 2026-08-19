import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-107: pending-duplicate findings accumulate across dev-edit reruns.
 *
 * Live-proven (p1-maya rejudge, api-traces/32): four near-identical PENDING
 * show-tell findings piled up on the SAME para-6 passage across four dev-edit
 * re-runs (byte-identical anchorQuote). The dismissed-lineage gate (D-13) only
 * arms on DISMISSED priors, and the content-hash dedup hashes the re-worded
 * DESCRIPTION — so a still-untriaged critique gets re-flagged as a fresh pending
 * finding every rerun. "Tell it once" leaks through pending duplicates.
 *
 * These tests pin the persist-time guard: a new finding whose anchorQuote
 * (NFC + whitespace-normalized) + category matches an existing PENDING finding
 * on the same book+chapter is suppressed, never persisted. A different category
 * or a genuinely-new span is unaffected, and the dismissed gate still works.
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
const OTHER_SENTENCE = "He said nothing, and the silence stretched between them.";
const CHAPTER_CONTENT = `${SENTENCE} She watched it from the window.\n\n${OTHER_SENTENCE}`;

const ctx = {
  bookId: "book-1",
  userId: "user-1",
  sessionId: "sess-2",
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
    category: "show-tell",
    description: "Freshly re-worded critique of the same passage.",
    rationale: "The passage tells rather than shows.",
    confidence: 0.8,
    paragraphNumber: 1,
    anchorQuote: SENTENCE,
    alternatives: [
      { label: "A", originalText: SENTENCE, newText: "Rain ribboned grey over the harbor." },
      { label: "B", originalText: SENTENCE, newText: "Grey rain fell over the harbor in ribbons." },
    ],
    ...overrides,
  };
}

interface FindingRow {
  id: string;
  bookId: string;
  chapterNumber: number;
  category: string;
  status: string;
  originalText: string | null;
  anchorQuote: string | null;
}

/** Emulate the Prisma where-clause so status/category/chapter scoping is really exercised. */
function seedFindings(rows: FindingRow[]) {
  h.db.editFinding.findMany.mockImplementation(
    async (args: {
      where: {
        bookId: string;
        chapterNumber: number;
        category: string;
        status: string;
        originalText?: { not: null };
        anchorQuote?: { not: null };
      };
    }) => {
      const w = args.where;
      return rows
        .filter(
          (r) =>
            r.bookId === w.bookId &&
            r.chapterNumber === w.chapterNumber &&
            r.category === w.category &&
            r.status === w.status &&
            (w.originalText?.not !== null || r.originalText !== null) &&
            (w.anchorQuote?.not !== null || r.anchorQuote !== null)
        )
        .map((r) => ({ id: r.id, originalText: r.originalText, anchorQuote: r.anchorQuote }));
    }
  );
}

function pending(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: "pending-1",
    bookId: "book-1",
    chapterNumber: 1,
    category: "show-tell",
    status: "pending",
    originalText: SENTENCE,
    anchorQuote: SENTENCE,
    ...overrides,
  };
}

function dismissed(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: "dismissed-1",
    bookId: "book-1",
    chapterNumber: 1,
    category: "show-tell",
    status: "dismissed",
    originalText: SENTENCE,
    anchorQuote: SENTENCE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.db.chapter.findFirst.mockResolvedValue({ id: "ch-row-1", chapterNumber: 1 });
  h.db.editFinding.findFirst.mockResolvedValue(null); // no content-hash duplicate
  h.db.editFinding.findMany.mockResolvedValue([]);
  h.db.editFinding.create.mockResolvedValue({ id: "new-finding-2" });
  (ctx.documentService.findByType as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "doc-1",
    currentVersion: 3,
  });
  (ctx.documentService.read as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: CHAPTER_CONTENT,
  });
});

describe("CreateFinding: pending-duplicate suppression (D-107)", () => {
  it("(a) suppresses a new finding whose anchorQuote+category matches a PENDING one", async () => {
    seedFindings([pending()]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toMatch(/suppressed/i);
    expect(result).toContain("pending-1");
    expect(h.db.editFinding.create).not.toHaveBeenCalled();
  });

  it("(a2) matches the pending anchorQuote whitespace-normalized (trailing newline)", async () => {
    seedFindings([pending({ anchorQuote: `${SENTENCE}\n` })]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toMatch(/suppressed/i);
    expect(h.db.editFinding.create).not.toHaveBeenCalled();
  });

  it("(b) allows the same anchorQuote under a DIFFERENT category", async () => {
    seedFindings([pending({ category: "prose" })]);

    const result = await executeTool(
      "CreateFinding",
      ctx,
      findingInput({ category: "show-tell" })
    );

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });

  it("(c) dismissed-lineage gate is unchanged (dismissed match still suppressed)", async () => {
    seedFindings([dismissed()]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toMatch(/suppressed/i);
    expect(result).toContain("DISMISSED");
    expect(result).toContain("dismissed-1");
    expect(h.db.editFinding.create).not.toHaveBeenCalled();
  });

  it("(d) persists a genuinely-new finding on different text", async () => {
    seedFindings([pending({ anchorQuote: OTHER_SENTENCE, originalText: OTHER_SENTENCE })]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });

  it("(e) does not suppress against a PENDING finding on a DIFFERENT chapter", async () => {
    seedFindings([pending({ chapterNumber: 2 })]);

    const result = await executeTool("CreateFinding", ctx, findingInput());

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });
});
