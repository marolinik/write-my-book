import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase B — a trim or expansion goes pending → drafted →
 * applied, and can be undone. The writer's own edits always win: a draft made
 * from an older version of the chapter is never written over newer text, and
 * an undo never takes back writing done after the apply.
 */

const h = vi.hoisted(() => ({
  db: {
    structureMove: { findFirst: vi.fn(), updateMany: vi.fn() },
    chapter: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  docs: { findByType: vi.fn(), read: vi.fn(), update: vi.fn() },
  reconcileBookCounters: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/books/book-counters", () => ({
  reconcileBookCounters: (...a: unknown[]) => h.reconcileBookCounters(...a),
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.docs.findByType;
    read = h.docs.read;
    update = h.docs.update;
  },
}));

import {
  applyRewriteMove,
  discardRewriteDraft,
  draftRewriteMove,
  restoreRewrite,
  RewriteEditedError,
  type GenerateRewrite,
} from "@/lib/structure/rewrite-move";

const words = (n: number, w = "reč") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");
const ORIGINAL = words(1000);
const ctx = { bookId: "b1", userId: "u1" };
const payload = {
  kind: "trim",
  chapterId: "c2",
  chapterNumber: 2,
  targetWords: 700,
  instructions: "Izbaci drugo čitanje pisma i ponovljeni put do manastira.",
};
const chapters = [
  { id: "c1", chapterNumber: 1, title: "A", wordCount: 1500, actNumber: 1, status: "drafted" },
  { id: "c2", chapterNumber: 2, title: "Pustinja", wordCount: 1000, actNumber: 1, status: "drafted" },
];

function pendingTrim(extra: Record<string, unknown> = {}) {
  return { id: "m1", bookId: "b1", kind: "trim", status: "pending", payload: JSON.stringify(payload), ...extra };
}

const genOk: GenerateRewrite = vi.fn(async () => ({
  text: words(720, "nova"),
  stopReason: "end_turn",
  reasoningOnly: false,
  tokens: { input: 9000, output: 2000 },
}));

const draftCtx = { ...ctx, language: "sr", fingerprint: null, storyBible: null, reasoning: false, modelId: "local/x" };

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findMany.mockResolvedValue(chapters);
  h.db.structureMove.updateMany.mockResolvedValue({ count: 1 });
  h.docs.findByType.mockResolvedValue({ id: "d2" });
  h.docs.read.mockResolvedValue({ document: { currentVersion: 4 }, content: ORIGINAL });
  h.docs.update.mockResolvedValue({ version: { version: 5 } });
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.db));
});

describe("draftRewriteMove", () => {
  it("stores the draft and the chapter version it was made from", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    const out = await draftRewriteMove("m1", draftCtx, genOk);
    expect(out.ok).toBe(true);
    const [args] = h.db.structureMove.updateMany.mock.calls.find(([a]) => a.data?.status === "drafted")!;
    expect(args.where).toMatchObject({ id: "m1", bookId: "b1", status: "drafting" });
    expect(args.data.draft).toContain("nova0");
    expect(JSON.parse(args.data.draftMeta)).toMatchObject({ baseDocId: "d2", baseVersion: 4, baseWords: 1000, draftWords: 720 });
  });

  it("briefs the model with the target and the instructions", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    await draftRewriteMove("m1", draftCtx, genOk);
    const call = vi.mocked(genOk).mock.calls[0][0];
    expect(call.user).toContain("700");
    expect(call.user).toContain("drugo čitanje pisma");
    expect(call.system).toMatch(/TRIM/);
  });

  it("claims the move before the model runs, so a second click cannot bill a second draft", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    h.db.structureMove.updateMany.mockResolvedValueOnce({ count: 0 });
    const out = await draftRewriteMove("m1", draftCtx, genOk);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("not_pending");
    expect(genOk).not.toHaveBeenCalled();
    expect(h.db.structureMove.updateMany.mock.calls[0][0].data.status).toBe("drafting");
  });

  it("releases the claim when the draft fails", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    const gen: GenerateRewrite = vi.fn(async () => ({
      text: words(990, "nova"), stopReason: "end_turn", reasoningOnly: false, tokens: { input: 1, output: 1 },
    }));
    await draftRewriteMove("m1", draftCtx, gen);
    const release = h.db.structureMove.updateMany.mock.calls.find(([a]) => a.data?.status === "pending");
    expect(release![0].where).toMatchObject({ id: "m1", status: "drafting" });
  });

  it("refuses a rewrite that does not know its chapter by identity", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(
      pendingTrim({ payload: JSON.stringify({ ...payload, chapterId: undefined }) })
    );
    const out = await draftRewriteMove("m1", draftCtx, genOk);
    expect(out.ok).toBe(false);
    expect(genOk).not.toHaveBeenCalled();
  });

  it("refuses a move that is not pending, and calls no model", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim({ status: "drafted" }));
    const out = await draftRewriteMove("m1", draftCtx, genOk);
    expect(out.ok).toBe(false);
    expect(genOk).not.toHaveBeenCalled();
  });

  it("keeps no draft that missed its target, and still reports the tokens spent", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    const gen: GenerateRewrite = vi.fn(async () => ({
      text: words(990, "nova"),
      stopReason: "end_turn",
      reasoningOnly: false,
      tokens: { input: 9000, output: 2000 },
    }));
    const out = await draftRewriteMove("m1", draftCtx, gen);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("draft_rejected");
    const stored = h.db.structureMove.updateMany.mock.calls.filter(([a]) => a.data?.status === "drafted");
    expect(stored).toHaveLength(0);
  });

  it("names a model that returned only reasoning", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    const gen: GenerateRewrite = vi.fn(async () => ({
      text: "",
      stopReason: "end_turn",
      reasoningOnly: true,
      tokens: { input: 9000, output: 2000 },
    }));
    const out = await draftRewriteMove("m1", draftCtx, gen);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("model_no_prose");
  });
});

describe("applyRewriteMove", () => {
  const meta = { baseDocId: "d2", baseVersion: 4, baseWords: 1000, draftWords: 720, model: "local/x", draftedAt: "x" };
  const drafted = () =>
    pendingTrim({ status: "drafted", draft: words(720, "nova"), draftMeta: JSON.stringify(meta) });

  it("writes the draft over the version it was made from and records how to undo it", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(drafted());
    const out = await applyRewriteMove("m1", ctx);
    expect(out.ok).toBe(true);
    const [docId, content, , , , expected] = h.docs.update.mock.calls[0];
    expect(docId).toBe("d2");
    expect(content).toContain("nova0");
    expect(expected).toBe(4);
    expect(h.db.chapter.update.mock.calls[0][0]).toMatchObject({ where: { id: "c2" }, data: { wordCount: 720 } });
    const commit = h.db.structureMove.updateMany.mock.calls.find(([a]) => a.data?.status === "applied")!;
    expect(commit[0].where).toMatchObject({ id: "m1", status: "drafted" });
    expect(JSON.parse(commit[0].data.previousState)).toMatchObject({
      sourceChapterId: "c2",
      sourceContent: ORIGINAL,
      sourceWordCount: 1000,
      rewriteVersion: 5,
    });
  });

  it("refuses when the writer edited the chapter after the draft was made", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(drafted());
    h.docs.read.mockResolvedValue({ document: { currentVersion: 6 }, content: ORIGINAL + " nova rečenica" });
    const out = await applyRewriteMove("m1", ctx);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("chapter_edited");
    expect(h.docs.update).not.toHaveBeenCalled();
  });

  it("refuses a move with no draft", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(pendingTrim());
    const out = await applyRewriteMove("m1", ctx);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("not_drafted");
  });

  it("never puts the chapter back blind when the write reported no version", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(drafted());
    h.docs.update.mockResolvedValueOnce({});
    h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await applyRewriteMove("m1", ctx);
    expect(out.ok).toBe(false);
    expect(h.docs.update).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("puts the chapter back when the commit is refused", async () => {
    h.db.structureMove.findFirst.mockResolvedValue(drafted());
    h.db.structureMove.updateMany.mockResolvedValue({ count: 0 });
    const out = await applyRewriteMove("m1", ctx);
    expect(out.ok).toBe(false);
    const back = h.docs.update.mock.calls[1];
    expect(back[1]).toBe(ORIGINAL);
    expect(back[5]).toBe(5);
  });
});

describe("restoreRewrite (undo)", () => {
  const previous = { ordering: [], sourceChapterId: "c2", sourceContent: ORIGINAL, sourceWordCount: 1000, rewriteVersion: 5 };

  it("restores the original prose and word count", async () => {
    h.docs.read.mockResolvedValue({ document: { currentVersion: 5 }, content: words(720, "nova") });
    await restoreRewrite(ctx, previous);
    expect(h.docs.update.mock.calls[0][1]).toBe(ORIGINAL);
    expect(h.docs.update.mock.calls[0][5]).toBe(5);
    expect(h.db.chapter.update.mock.calls[0][0]).toMatchObject({ data: { wordCount: 1000 } });
  });

  it("finishes a half-done undo: prose already restored, only the count is repaired", async () => {
    h.docs.read.mockResolvedValue({ document: { currentVersion: 6 }, content: ORIGINAL });
    await restoreRewrite(ctx, previous);
    expect(h.docs.update).not.toHaveBeenCalled();
    expect(h.db.chapter.update.mock.calls[0][0]).toMatchObject({ data: { wordCount: 1000 } });
  });

  it("refuses to take back writing done after the apply", async () => {
    h.docs.read.mockResolvedValue({ document: { currentVersion: 7 }, content: "edited" });
    await expect(restoreRewrite(ctx, previous)).rejects.toBeInstanceOf(RewriteEditedError);
    expect(h.docs.update).not.toHaveBeenCalled();
  });
});

describe("discardRewriteDraft", () => {
  it("returns a drafted move to pending and drops its draft", async () => {
    await discardRewriteDraft("m1", "b1");
    const [args] = h.db.structureMove.updateMany.mock.calls[0];
    expect(args.where).toMatchObject({ id: "m1", bookId: "b1", status: "drafted" });
    expect(args.data).toMatchObject({ status: "pending", draft: null, draftMeta: null });
  });
});
