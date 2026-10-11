import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A manuscript imported from Windows kept its CRLF line endings, so every
 * paragraph break was "

". Grounding split paragraphs on /

+/,
 * saw the whole chapter as ONE paragraph, and rejected every finding below
 * paragraph 1: live run 2026-10-11, beta-read ch1 of an imported book, three
 * CreateFinding calls rejected "Paragraph 2 does not exist. The chapter has 1
 * paragraphs" before the model gave up and filed the note against paragraph 1.
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


import { splitParagraphs } from "@/lib/text/paragraphs";
import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";

const ANCHOR =
  "She stood at the edge of the mainland with her father's keys in her coat pocket and watched the sea lie down across the road like a dog across a doorway.";
const CHAPTER_CONTENT = [
  "The causeway to Marrowby only shows itself twice a day, and Edith Vane arrived at the wrong hour.",
  ANCHOR,
  "She waited in the car. She watched the lighthouse.",
].join("\r\n\r\n");

const ALTERNATIVES = [
  {
    label: "Option A — embodied register",
    originalText: ANCHOR,
    newText:
      "The cold reached her ankles before she noticed she had stopped walking, and she understood she was the kind who kept feeling at arm's length.",
  },
  {
    label: "Option B — compressed",
    originalText: ANCHOR,
    newText:
      "She was the second kind — the kind that built seawalls against feeling — and she had likely always been.",
  },
];

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


beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findFirst.mockResolvedValue({ id: "ch-row-1", chapterNumber: 1 });
  h.db.editFinding.findFirst.mockResolvedValue(null);
  h.db.editFinding.findMany.mockResolvedValue([]);
  h.db.editFinding.create.mockResolvedValue({ id: "new-finding-1" });
  (ctx.documentService.findByType as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "doc-1", currentVersion: 3 });
  (ctx.documentService.read as ReturnType<typeof vi.fn>).mockResolvedValue({ content: CHAPTER_CONTENT });
});

describe("splitParagraphs", () => {
  it("splits CRLF, LF and lone-CR text into the same paragraphs", () => {
    const lf = "One.\n\nTwo.\n\nThree.";
    expect(splitParagraphs(lf)).toEqual(["One.", "Two.", "Three."]);
    expect(splitParagraphs(lf.replace(/\n/g, "\r\n"))).toEqual(["One.", "Two.", "Three."]);
    expect(splitParagraphs(lf.replace(/\n/g, "\r"))).toEqual(["One.", "Two.", "Three."]);
  });

  it("treats a whitespace-only line as a paragraph break and drops empties", () => {
    expect(splitParagraphs("One.\n  \nTwo.\n\n\n")).toEqual(["One.", "Two."]);
  });

  it("treats a line of no-break spaces (Word export) as a paragraph break", () => {
    expect(splitParagraphs("One.\n \nTwo.\r\n　\r\nThree.")).toEqual(["One.", "Two.", "Three."]);
  });
});

describe("CreateFinding grounding on a CRLF chapter", () => {
  it("accepts a finding anchored in paragraph 2", async () => {
    const result = await executeTool("CreateFinding", ctx, {
      severity: "suggestion",
      category: "clarity",
      confidence: 0.8,
      chapterNumber: 1,
      paragraphNumber: 2,
      anchorQuote: ANCHOR,
      description: "The origin of the father's keys is never addressed.",
      rationale:
        "The keys carry the chapter's grief; one clause on how she came by them would ground it without slowing the opening.",
      alternatives: ALTERNATIVES,
    });
    expect(result).not.toMatch(/REJECTED/);
    expect(h.db.editFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paragraphNumber: 2 }) })
    );
    const data = h.db.editFinding.create.mock.calls[0][0].data;
    expect(data.status).not.toBe("rejected");
  });
});

describe("structured import normalizes line endings", () => {
  it("stores client-sent chapter content with LF only", async () => {
    const { importConfirmRequestSchema } = await import("@/lib/validation");
    const parsed = importConfirmRequestSchema.parse({
      chapters: [{ number: 1, title: "One", content: "A.\r\n\r\nB.\rC.", action: "create" }],
    });
    expect(parsed.chapters[0].content).toBe("A.\n\nB.\nC.");
  });
});

describe("import normalizes line endings", () => {
  it("stores chapters with LF only, whatever the file used", () => {
    const md =
      "# Chapter 1: The Causeway\r\nFirst paragraph.\r\n\r\nSecond paragraph.\r\n\r\n# Chapter 2: Forty-One Steps\r\nThird.\r\n";
    const chapters = parseManuscriptChapters(md);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe("The Causeway");
    for (const c of chapters) expect(c.content).not.toContain("\r");
    expect(splitParagraphs(chapters[0].content).length).toBeGreaterThanOrEqual(2);
  });
});
