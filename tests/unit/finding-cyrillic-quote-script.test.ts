import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-S12 — a finding about a Cyrillic passage could never be applied.
 *
 * On a Serbian book, CreateFinding transliterated everything the model wrote
 * to Latin, including the anchor and the passage a finding replaces. Those are
 * QUOTES of the chapter, and the writer's own prose is never transliterated —
 * a pasted Cyrillic paragraph stays Cyrillic. So the stored quote was Latin,
 * the chapter was Cyrillic, and Apply answered 409 "may have been edited since
 * the finding was created" every time. The finding that said "this paragraph
 * is in Cyrillic, transliterate it" was the one that could not be applied.
 *
 * A quote keeps the script of the text it quotes. The replacement text is the
 * book's script (Latin), and the model's stray homoglyphs in a quote of Latin
 * prose are still cleaned (C-4).
 */

const h = vi.hoisted(() => ({
  db: {
    chapter: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({ DocumentService: class {} }));
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

const LATIN_PARA = "Jutro je bilo hladno. Milena je otvorila prozor i pogledala dvorište.";
const CYRILLIC_PARA =
  "Стари бунар у дворишту био је пун лишћа. Нико га није чистио од очеве смрти.";
const CHAPTER = `${LATIN_PARA}\n\n${CYRILLIC_PARA}`;

let chapterContent = CHAPTER;

const ctx = {
  bookId: "book-1",
  userId: "user-1",
  sessionId: "sess-1",
  agentType: "dev-editor",
  language: "sr",
  documentService: {
    findByType: vi.fn(),
    read: vi.fn(),
  },
} as unknown as ToolContext;

function input(anchor: string, original: string, replacement: string, paragraphNumber = 2) {
  return {
    chapterNumber: 3,
    severity: "critical",
    category: "consistency",
    description: "Završni pasus je napisan ćirilicom, a knjiga je latinicom.",
    rationale: "Pismo knjige je latinica.",
    suggestion: "Prebacite pasus u latinicu.",
    confidence: 0.9,
    paragraphNumber,
    anchorQuote: anchor,
    alternatives: [
      { label: "Latinica", originalText: original, newText: replacement },
      { label: "Kraće", originalText: original, newText: `${replacement} ` },
    ],
  };
}

function persisted() {
  return h.db.editFinding.create.mock.calls.at(-1)?.[0].data as {
    anchorQuote: string;
    originalText: string;
    newText: string;
    alternatives: string;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chapterContent = CHAPTER;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.db.chapter.findFirst.mockResolvedValue({ id: "ch-3", chapterNumber: 3 });
  h.db.editFinding.findFirst.mockResolvedValue(null);
  h.db.editFinding.findMany.mockResolvedValue([]);
  h.db.editFinding.create.mockResolvedValue({ id: "f-new" });
  (ctx.documentService.findByType as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "doc-3",
    currentVersion: 4,
  });
  (ctx.documentService.read as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
    content: chapterContent,
  }));
});

describe("CreateFinding keeps a quote in the script of the text it quotes (P6-S12)", () => {
  it("stores the anchor and the replaced passage in Cyrillic when the chapter is Cyrillic there", async () => {
    const quote = "Стари бунар у дворишту био је пун лишћа.";
    await executeTool(
      "CreateFinding",
      ctx,
      input(quote, quote, "Stari bunar u dvorištu bio je pun lišća.")
    );

    const row = persisted();
    expect(row.anchorQuote).toBe(quote);
    expect(row.originalText).toBe(quote);
    expect(chapterContent).toContain(row.originalText);
    // The replacement is written in the book's script.
    expect(row.newText).toBe("Stari bunar u dvorištu bio je pun lišća.");
    expect(JSON.parse(row.alternatives)[0].originalText).toBe(quote);
  });

  it("still transliterates the replacement when the model wrote it in Cyrillic", async () => {
    const quote = "Нико га није чистио од очеве смрти.";
    await executeTool("CreateFinding", ctx, input(quote, quote, "Нико га није чистио."));

    expect(persisted().originalText).toBe(quote);
    expect(persisted().newText).toBe("Niko ga nije čistio.");
  });

  it("still cleans stray Cyrillic out of a quote of Latin prose (C-4)", async () => {
    // "Milena" with two Cyrillic homoglyphs (е, а), quoting prose that is Latin.
    const contaminated = "Jutro je bilo hladno. Milеnа je otvorila prozor";
    await executeTool(
      "CreateFinding",
      ctx,
      input(contaminated, contaminated, "Jutro je bilo ledeno. Milena je otvorila prozor", 1)
    );

    const row = persisted();
    expect(row.anchorQuote).toBe("Jutro je bilo hladno. Milena je otvorila prozor");
    expect(row.originalText).toBe("Jutro je bilo hladno. Milena je otvorila prozor");
    expect(chapterContent).toContain(row.originalText);
  });
});
