import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase C — a hook move rewrites only a chapter's opening or
 * ending, through the same draft -> apply -> undo path as trim and expand.
 */

const h = vi.hoisted(() => ({
  db: {
    structureMove: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    chapter: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  docs: { findByType: vi.fn(), read: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/books/book-counters", () => ({ reconcileBookCounters: vi.fn() }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.docs.findByType;
    read = h.docs.read;
    update = h.docs.update;
  },
}));

import { moveIdentityKey, planMove, type ChapterRef } from "@/lib/structure/moves";
import { buildRewriteSystemPrompt, settleRewrite } from "@/lib/structure/rewrite-prompt";
import { draftRewriteMove, type GenerateRewrite } from "@/lib/structure/rewrite-move";
import { executeTool, getToolDefinitions } from "@/lib/agents/tools";

const chapters: ChapterRef[] = [
  { id: "c7", chapterNumber: 7, title: "Kuća", wordCount: 1200, actNumber: 1 },
];
const instructions = "Kraj se gasi na opisu kiše; završi na Jovanovoj odluci da ne otvori pismo.";
const para = (label: string) => `${label} prva. ${label} druga. ${label} treća.`;
const CHAPTER = ["# Poglavlje 7", "", para("Uvod"), "", "◆", "", para("Sredina"), "", "◆", "", para("Kiša"), "", para("Kraj")].join("\n");

describe("planning a hook", () => {
  it("plans an opening or an ending of an existing chapter", () => {
    expect(planMove(chapters, { kind: "hook", chapterId: "c7", chapterNumber: 7, scope: "ending", instructions }).ok).toBe(true);
  });

  it("refuses a scope other than opening or ending", () => {
    expect(planMove(chapters, { kind: "hook", chapterNumber: 7, scope: "middle" as never, instructions }).ok).toBe(false);
  });

  it("treats the opening and the ending of one chapter as different moves", () => {
    const a = moveIdentityKey({ kind: "hook", chapterId: "c7", chapterNumber: 7, scope: "opening", instructions });
    const b = moveIdentityKey({ kind: "hook", chapterId: "c7", chapterNumber: 7, scope: "ending", instructions });
    expect(a).not.toBe(b);
  });
});

describe("the hook brief and its judge", () => {
  it("briefs an ending as the page-turn and keeps the story's facts", () => {
    const p = buildRewriteSystemPrompt({ kind: "hook", scope: "ending", language: "sr", fingerprint: null, storyBible: null });
    expect(p).toMatch(/HOOK/);
    expect(p).toMatch(/ending/i);
  });

  it("refuses an 'ending' that keeps the original passage whole and appends to it (live, run 4)", () => {
    const original =
      "Mladić je otišao bez reči. Sekretarica je zatvorila fioku i vratila se poslu. " +
      "Napolju je padala kiša, a hodnik je ostao onakav kakav je bio, sa tablom i fasciklama.";
    const ctx = { kind: "hook" as const, original, originalWords: 30, targetWords: 30 };
    const appended = `${original} Ime na listi bilo je precrtano.`;
    expect(settleRewrite(appended, "end_turn", ctx)).toEqual({ ok: false, reason: "off-target" });
  });

  it("lets a rewrite keep a short original passage it builds toward", () => {
    const original = "Pogledao ju je. Rekla je ne.";
    const ctx = { kind: "hook" as const, original, originalWords: 6, targetWords: 6 };
    expect(settleRewrite("Ćutao je dugo. Pogledao ju je. Rekla je ne.", "end_turn", ctx).ok).toBe(true);
  });

  it("tells the ghostwriter to rewrite the passage, not extend it", () => {
    const p = buildRewriteSystemPrompt({ kind: "hook", scope: "ending", language: "sr", fingerprint: null, storyBible: null });
    expect(p).toMatch(/do not keep the passage and add to it/i);
  });

  it("accepts a rewritten edge of comparable length and refuses a gutted one", () => {
    const original = "reč ".repeat(100).trim();
    const ctx = { kind: "hook" as const, original, originalWords: 100, targetWords: 100 };
    expect(settleRewrite("nova ".repeat(110).trim(), "end_turn", ctx).ok).toBe(true);
    expect(settleRewrite("nova ".repeat(30).trim(), "end_turn", ctx).ok).toBe(false);
  });
});

describe("drafting a hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.chapter.findMany.mockResolvedValue(chapters);
    h.db.structureMove.updateMany.mockResolvedValue({ count: 1 });
    h.db.structureMove.findFirst.mockResolvedValue({
      id: "m1",
      bookId: "b1",
      kind: "hook",
      status: "pending",
      payload: JSON.stringify({ kind: "hook", chapterId: "c7", chapterNumber: 7, scope: "ending", instructions }),
    });
    h.docs.findByType.mockResolvedValue({ id: "d7" });
    h.docs.read.mockResolvedValue({ document: { currentVersion: 2 }, content: CHAPTER });
  });

  it("sends only the last scene and stores the whole chapter with just that scene replaced", async () => {
    const gen: GenerateRewrite = vi.fn(async () => ({
      text: "Kiša je stala. Jovan je pismo vratio u fioku, neotvoreno.",
      stopReason: "end_turn",
      reasoningOnly: false,
      tokens: { input: 1, output: 1 },
    }));
    const out = await draftRewriteMove("m1", { bookId: "b1", userId: "u1", language: "sr", fingerprint: null, storyBible: null, reasoning: false, modelId: "x" }, gen);
    expect(out.ok).toBe(true);
    const sent = vi.mocked(gen).mock.calls[0][0].user;
    const passage = sent.slice(sent.indexOf("<passage>"), sent.indexOf("</passage>"));
    expect(passage).toContain("Kiša prva.");
    expect(passage).not.toContain("Sredina prva.");
    expect(passage).not.toContain("Uvod prva.");
    const stored = h.db.structureMove.updateMany.mock.calls.find(([a]) => a.data?.status === "drafted")![0].data.draft;
    expect(stored).toContain("# Poglavlje 7");
    expect(stored).toContain("Sredina prva. Sredina druga. Sredina treća.");
    expect(stored).toContain("Jovan je pismo vratio u fioku");
    expect(stored).not.toContain("Kraj prva.");
  });
});

describe("ProposeStructureMove — hook", () => {
  const ctx = { bookId: "b1", userId: "u1", sessionId: "root", agentType: "story-architect", documentService: {} as never, language: "sr" };
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.chapter.findMany.mockResolvedValue(chapters);
    h.db.structureMove.findMany.mockResolvedValue([]);
    h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });
    h.db.structureMove.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data }));
  });

  it("files a hook with its scope", async () => {
    await executeTool("ProposeStructureMove", ctx as never, {
      kind: "hook", chapterNumbers: [7], scope: "ending", instructions, reason: "Kraj ne vuče dalje.", confidence: 0.6,
    });
    expect(JSON.parse(h.db.structureMove.create.mock.calls[0][0].data.payload)).toMatchObject({ kind: "hook", scope: "ending", chapterId: "c7" });
  });

  it("offers hook and a scope to the model", () => {
    const def = getToolDefinitions(["ProposeStructureMove"])[0];
    const props = def.input_schema.properties as Record<string, { enum?: string[] }>;
    expect(props.kind.enum).toContain("hook");
    expect(props.scope.enum).toEqual(["opening", "ending"]);
  });
});
