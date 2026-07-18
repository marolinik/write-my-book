import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-33: CreateFinding crashes with a raw internal TypeError when the model
 * omits `paragraphNumber`.
 *
 * Live-proven (p1-maya D-13 re-verify dev-edit #4, SSE ev#570-573,
 * toolUseId call-955d8ca6): model omitted `paragraphNumber` (+ `alternatives`).
 * validateFinding's range check passes `undefined` (both comparisons false)
 * -> `paragraphs[NaN]` yields `undefined` -> fuzzyMatch throws at
 * `haystack.normalize`. The model received the raw
 * "Error executing CreateFinding: Cannot read properties of undefined
 * (reading 'normalize')" instead of corrective REJECTED guidance, and the
 * rejected-row analytics write was bypassed.
 *
 * These tests pin the fix: missing / non-numeric / non-integer
 * paragraphNumber produces a structured REJECTED message naming the field
 * and the valid range, routed through the normal rejected-row analytics
 * path (with a value the Int? column can accept). Valid input is unchanged.
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

// Verbatim anchorQuote from the failing live call (call-955d8ca6).
const ANCHOR =
  "She thought about the difference between people who rushed toward feeling and people who built elaborate structures to keep it at a survivable distance, and she understood, with the particular clarity the sea seemed to specialize in, that she was the second kind, and that she had likely always been.";

// 3 paragraphs; the anchor is paragraph 2, so the valid range is 1..3.
const CHAPTER_CONTENT = [
  "The morning tide had left the flats bare and shining, and Imogen walked them with the letter pressed against her ribs.",
  ANCHOR,
  "By the time she reached the seawall the light had gone flat and pewter, and the town behind her had begun to switch itself on.",
].join("\n\n");

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

/**
 * Verbatim toolInput shape from the live failing call (SSE evidence,
 * toolUseId call-955d8ca6): these exact seven keys, in this order —
 * NO paragraphNumber, NO alternatives.
 */
function evidenceShapeInput(overrides: Record<string, unknown> = {}) {
  return {
    severity: "suggestion",
    anchorQuote: ANCHOR,
    category: "show-tell",
    confidence: 0.85,
    chapterNumber: 1,
    rationale:
      "The chapter's power derives from rendering emotional states through physical and environmental reality: the burn before touching, the letter against ribs, wading through shallows. This sentence steps into clinical taxonomy that reads like textbook mental health language rather than the visceral, coastal register that defines the prose voice.",
    description:
      "Imogen's shoreline self-recognition is delivered through abstract psychological classification rather than embodied sensation, breaking the chapter's sensory-metaphorical mode.",
    ...overrides,
  };
}

function expectStructuredParagraphRejection(result: string) {
  // Clean corrective guidance, not a leaked internal error.
  expect(result).toMatch(/REJECTED/);
  expect(result).toContain("paragraphNumber");
  expect(result).toContain("between 1 and 3");
  expect(result).not.toContain("Error executing");
  expect(result).not.toContain("normalize");
  // Rejection must flow through the rejected-row analytics write, with a
  // value the Int? column can accept (null when input was not an integer).
  expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  expect(h.db.editFinding.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "rejected",
        paragraphNumber: null,
        rejectionReason: expect.stringContaining("paragraphNumber"),
      }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findFirst.mockResolvedValue({ id: "ch-row-1", chapterNumber: 1 });
  h.db.editFinding.findFirst.mockResolvedValue(null); // content-hash dedup
  h.db.editFinding.findMany.mockResolvedValue([]); // D-13 dismissed priors
  h.db.editFinding.create.mockResolvedValue({ id: "new-finding-1" });
  (ctx.documentService.findByType as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "doc-1",
    currentVersion: 3,
  });
  (ctx.documentService.read as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: CHAPTER_CONTENT,
  });
});

describe("CreateFinding: paragraphNumber input validation (D-33)", () => {
  it("(a) omitted paragraphNumber + omitted alternatives (verbatim live shape) is cleanly rejected, not a raw TypeError", async () => {
    const result = await executeTool("CreateFinding", ctx, evidenceShapeInput());

    expectStructuredParagraphRejection(result);
  });

  it("(b) omitted paragraphNumber alone (alternatives valid) is cleanly rejected, not a raw TypeError", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ alternatives: ALTERNATIVES })
    );

    expectStructuredParagraphRejection(result);
  });

  it("(c) non-numeric paragraphNumber (string) is cleanly rejected and analytics row stores null, not the string", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: "2", alternatives: ALTERNATIVES })
    );

    expectStructuredParagraphRejection(result);
  });

  it("(d) non-integer paragraphNumber (in-range float) is cleanly rejected, not a raw TypeError", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: 2.5, alternatives: ALTERNATIVES })
    );

    expectStructuredParagraphRejection(result);
  });

  it("(e) out-of-range paragraphNumber keeps the existing structured rejection with analytics", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: 99, alternatives: ALTERNATIVES })
    );

    expect(result).toMatch(/REJECTED/);
    expect(result).toContain("does not exist");
    expect(result).not.toContain("Error executing");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected", paragraphNumber: 99 }),
      })
    );
  });

  it("(f) valid input is unchanged: finding is created", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: 2, alternatives: ALTERNATIVES })
    );

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paragraphNumber: 2 }),
      })
    );
  });
});

/**
 * D-34: same crash class as D-33, string-field edition.
 * (1) omitted anchorQuote -> fuzzyMatch(undefined, chapterContent) throws the
 *     identical `needle.normalize` TypeError at the anchor similarity gate.
 * (2) a present-but-malformed alternatives item missing originalText passes the
 *     length-only alternatives check, then crashes computeGroundingScore's
 *     fuzzyMatch AFTER validation succeeded.
 * Both must become structured REJECTED guidance routed through the rejected-row
 * analytics write (with values the columns can accept). Empty-string
 * originalText stays valid (D-13 empty-span parity — it never crashes).
 */
describe("CreateFinding: anchorQuote and alternatives shape validation (D-34)", () => {
  function expectAnchorRejection(result: string) {
    expect(result).toMatch(/REJECTED/);
    expect(result).toContain("anchorQuote");
    expect(result).not.toContain("Error executing");
    expect(result).not.toContain("normalize");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
          anchorQuote: null,
          rejectionReason: expect.stringContaining("anchorQuote"),
        }),
      })
    );
  }

  it("(g) omitted anchorQuote is cleanly rejected, not a raw TypeError", async () => {
    const input = evidenceShapeInput({
      paragraphNumber: 2,
      alternatives: ALTERNATIVES,
    }) as Record<string, unknown>;
    delete input.anchorQuote;

    const result = await executeTool("CreateFinding", ctx, input);

    expectAnchorRejection(result);
  });

  it("(h) non-string anchorQuote is cleanly rejected and analytics row stores null", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({
        anchorQuote: 5,
        paragraphNumber: 2,
        alternatives: ALTERNATIVES,
      })
    );

    expectAnchorRejection(result);
  });

  it("(i) alternatives item missing originalText is cleanly rejected, not a post-validation TypeError", async () => {
    const malformed = [
      ALTERNATIVES[0],
      { label: "Option B — compressed", newText: "She was the second kind." },
    ];

    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: 2, alternatives: malformed })
    );

    expect(result).toMatch(/REJECTED/);
    expect(result).toContain("alternatives[1]");
    expect(result).toContain("originalText");
    expect(result).not.toContain("Error executing");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
          rejectionReason: expect.stringContaining("originalText"),
        }),
      })
    );
  });

  it("(j) alternatives[0] missing originalText is also rejected (D-13 lookup optional-chains past it)", async () => {
    const malformed = [
      { label: "Option A — embodied register", newText: "The cold reached her ankles." },
      ALTERNATIVES[1],
    ];

    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: 2, alternatives: malformed })
    );

    expect(result).toMatch(/REJECTED/);
    expect(result).toContain("alternatives[0]");
    expect(result).not.toContain("Error executing");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });

  it("(k) non-array alternatives (string) is cleanly rejected, not a raw TypeError", async () => {
    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({
        paragraphNumber: 2,
        alternatives: "rewrite it more viscerally",
      })
    );

    expect(result).toMatch(/REJECTED/);
    expect(result).toContain("2 rewrite alternatives");
    expect(result).not.toContain("Error executing");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected" }),
      })
    );
  });

  it("(l) empty-string originalText in alternatives remains valid (D-13 empty-span parity)", async () => {
    const emptyAlts = [
      { label: "Tighter", originalText: "", newText: "The cold reached her ankles." },
      { label: "Softer", originalText: "", newText: "She was the second kind." },
    ];

    const result = await executeTool(
      "CreateFinding",
      ctx,
      evidenceShapeInput({ paragraphNumber: 2, alternatives: emptyAlts })
    );

    expect(result).toContain("Finding created");
    expect(h.db.editFinding.create).toHaveBeenCalledTimes(1);
  });
});
