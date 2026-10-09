/**
 * Dev editor v2, phase B — the life of a trim or an expansion:
 * pending → drafted (the ghostwriter's rewrite waits on the move) → applied,
 * and undone back to the original prose.
 *
 * The writer's own text always wins:
 *   - a draft records the chapter version it was made from, and applying it
 *     refuses if the chapter has been saved since (the writer edited it);
 *   - the write itself is guarded by that version, so a save racing the apply
 *     keeps the writer's text;
 *   - undo refuses if anything was saved after the apply.
 * The model call is injected, so every rule here runs without a provider.
 */

import { db } from "@/lib/db";
import { countWords } from "@/lib/utils";
import { enforceBookScript } from "@/lib/agents/serbian-script";
import { reconcileBookCounters } from "@/lib/books/book-counters";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { isRewriteKind, planRewrite, type MoveError, type RewriteMove } from "./moves";
import { joinEdge, splitEdge } from "./chapter-edges";
import {
  buildHookUserContent,
  buildRewriteSystemPrompt,
  buildRewriteUserContent,
  rewriteFitsBudget,
  rewriteMaxTokens,
  settleRewrite,
} from "./rewrite-prompt";

const CHANGE_SOURCE = "structure";
/**
 * A draft holds its move in `drafting` while the model writes, so a second
 * click or tab cannot run (and bill) a second draft. A claim older than this is
 * a crashed request, and the move is free again.
 */
const DRAFTING_STALE_MS = 15 * 60 * 1000;

export interface RewriteContext {
  bookId: string;
  userId: string;
}

export interface RewriteGeneration {
  text: string;
  stopReason: string | null;
  reasoningOnly: boolean;
  tokens: { input: number; output: number };
}

export type GenerateRewrite = (args: {
  system: string;
  user: string;
  maxTokens: number;
}) => Promise<RewriteGeneration>;

/** What a draft remembers about the chapter it was made from. */
export interface DraftMeta {
  baseDocId: string;
  baseVersion: number | undefined;
  baseWords: number;
  draftWords: number;
  model: string;
  draftedAt: string;
}

export type DraftOutcome =
  | { ok: true; baseWords: number; draftWords: number; tokens: RewriteGeneration["tokens"] }
  | { ok: false; error: MoveError; tokens?: RewriteGeneration["tokens"] };

export type RewriteOutcome = { ok: true; summary: string } | { ok: false; error: MoveError };

/** The writer saved the chapter after the apply; undo would take that back. */
export class RewriteEditedError extends Error {
  readonly code = "rewrite_edited" as const;
  constructor() {
    super("The chapter was edited after this change was applied, so undo would erase that writing.");
  }
}

function fail(code: MoveError["code"], message: string): { ok: false; error: MoveError } {
  return { ok: false, error: { code, message } };
}

interface ChapterText {
  docId: string | null;
  version: number | undefined;
  content: string;
}

async function readChapterText(docs: DocumentService, chapterNumber: number): Promise<ChapterText> {
  const doc = await docs.findByType(DocumentType.CHAPTER_CONTENT, chapterNumber);
  if (!doc) return { docId: null, version: undefined, content: "" };
  const read = await docs.read(doc.id);
  return { docId: doc.id, version: read?.document.currentVersion ?? undefined, content: read?.content ?? "" };
}

async function loadChapter(bookId: string, chapterId: string | undefined, chapterNumber: number) {
  const chapters = await db.chapter.findMany({
    where: { bookId },
    select: { id: true, chapterNumber: true, title: true, wordCount: true, actNumber: true },
    orderBy: { chapterNumber: "asc" },
  });
  const chapter = chapterId
    ? chapters.find((c) => c.id === chapterId)
    : chapters.find((c) => c.chapterNumber === chapterNumber);
  return { chapters, chapter };
}

/** Ask the ghostwriter for a draft of a pending trim/expand and keep it on the move. */
export async function draftRewriteMove(
  moveId: string,
  ctx: RewriteContext & {
    language: string;
    fingerprint: string | null;
    storyBible: string | null;
    reasoning: boolean;
    modelId: string;
  },
  generate: GenerateRewrite
): Promise<DraftOutcome> {
  const move = await db.structureMove.findFirst({ where: { id: moveId, bookId: ctx.bookId } });
  if (!move) return fail("move_not_found", "This proposal no longer exists.");
  if (!isRewriteKind(move.kind)) return fail("unknown_kind", "Only a trim or an expansion has a draft.");
  const staleBefore = new Date(Date.now() - DRAFTING_STALE_MS);
  const staleClaim = move.status === "drafting" && !!move.updatedAt && move.updatedAt < staleBefore;
  if (move.status !== "pending" && !staleClaim) {
    return fail("not_pending", `This proposal is already ${move.status}.`);
  }

  const input = JSON.parse(move.payload) as RewriteMove;
  // A rewrite runs the model on a whole chapter; it must be the chapter the
  // editor read, never whichever one now carries the number.
  if (!input.chapterId) {
    return fail("chapter_not_found", "This proposal does not name its chapter; ask the editor to propose it again.");
  }
  const { chapters, chapter } = await loadChapter(ctx.bookId, input.chapterId, input.chapterNumber);
  if (!chapter) return fail("chapter_not_found", "The chapter this move was written for no longer exists.");
  // Re-planned against the chapter as it is now: the writer may have changed
  // its length since the proposal.
  const planned = planRewrite(chapters, { ...input, chapterNumber: chapter.chapterNumber });
  if (!planned.ok) return planned;

  const docs = new DocumentService(ctx.userId, ctx.bookId);
  const text = await readChapterText(docs, chapter.chapterNumber);
  if (!text.docId || text.content.trim().length === 0) {
    return fail("content_missing", "This chapter has no text to revise.");
  }
  // A hook rewrites one edge; trim and expand rewrite the whole chapter.
  const edge = input.kind === "hook" ? splitEdge(text.content, input.scope ?? "ending") : null;
  const source = edge ? edge.segment : text.content;
  if (edge && source.trim().length === 0) {
    return fail("content_missing", "This chapter has no opening or ending to revise.");
  }
  const sourceWords = countWords(source);
  const budget = {
    kind: input.kind,
    targetWords: input.targetWords ?? sourceWords,
    reasoning: ctx.reasoning,
  };
  if (!rewriteFitsBudget(source, budget)) {
    return fail("chapter_too_long", "This chapter is too long to revise in one reply.");
  }

  const baseWords = countWords(text.content);
  const claimed = await db.structureMove.updateMany({
    where: {
      id: moveId,
      bookId: ctx.bookId,
      OR: [{ status: "pending" }, { status: "drafting", updatedAt: { lt: staleBefore } }],
    },
    data: { status: "drafting" },
  });
  if (claimed.count === 0) return fail("not_pending", "A draft of this proposal is already being written.");
  const release = () =>
    db.structureMove
      .updateMany({ where: { id: moveId, status: "drafting" }, data: { status: "pending" } })
      .catch((err) => console.error(`[structure] could not release the draft claim on ${moveId}:`, err));

  let generation: RewriteGeneration;
  try {
    generation = await generate({
    system: buildRewriteSystemPrompt({
      kind: input.kind,
      scope: input.scope,
      language: ctx.language,
      fingerprint: ctx.fingerprint,
      storyBible: ctx.storyBible,
    }),
    user: edge
      ? buildHookUserContent({
          scope: input.scope ?? "ending",
          segment: edge.segment,
          context: (input.scope === "opening" ? edge.after : edge.before).slice(
            input.scope === "opening" ? 0 : -3000,
            input.scope === "opening" ? 3000 : undefined
          ),
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          instructions: input.instructions,
        })
      : buildRewriteUserContent({
          chapterText: text.content,
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          currentWords: baseWords,
          targetWords: input.targetWords ?? baseWords,
          instructions: input.instructions,
        }),
    maxTokens: rewriteMaxTokens(source, budget),
    });
  } catch (error) {
    await release();
    throw error;
  }

  if (generation.reasoningOnly) {
    await release();
    return { ...fail("model_no_prose", "The ghostwriter's model returned only reasoning and no prose."), tokens: generation.tokens };
  }
  const settled = settleRewrite(generation.text, generation.stopReason, {
    kind: input.kind,
    original: source,
    originalWords: sourceWords,
    targetWords: input.targetWords ?? sourceWords,
    language: ctx.language,
  });
  if (!settled.ok) {
    await release();
    return {
      ...fail("draft_rejected", `The draft could not be used (${settled.reason}). Try again.`),
      tokens: generation.tokens,
    };
  }

  const rewritten = enforceBookScript(settled.text, ctx.language);
  const draft = edge ? joinEdge(edge, rewritten) : rewritten;
  const meta: DraftMeta = {
    baseDocId: text.docId,
    baseVersion: text.version,
    baseWords,
    draftWords: countWords(draft),
    model: ctx.modelId,
    draftedAt: new Date().toISOString(),
  };
  let stored = 0;
  try {
    ({ count: stored } = await db.structureMove.updateMany({
      where: { id: moveId, bookId: ctx.bookId, status: "drafting" },
      data: { status: "drafted", draft, draftMeta: JSON.stringify(meta) },
    }));
  } catch (error) {
    console.error(`[structure] draft of ${moveId} could not be stored:`, error);
    await release();
    return { ...fail("apply_failed", "The draft could not be saved. Try again."), tokens: generation.tokens };
  }
  if (stored === 0) return { ...fail("not_pending", "This proposal was decided while the draft was written."), tokens: generation.tokens };
  return { ok: true, baseWords, draftWords: meta.draftWords, tokens: generation.tokens };
}

/** The writer applies a drafted trim/expand: the draft replaces the chapter. */
export async function applyRewriteMove(moveId: string, ctx: RewriteContext): Promise<RewriteOutcome> {
  const move = await db.structureMove.findFirst({ where: { id: moveId, bookId: ctx.bookId } });
  if (!move) return fail("move_not_found", "This proposal no longer exists.");
  if (move.status !== "drafted" || !move.draft || !move.draftMeta) {
    return fail("not_drafted", "Make a draft first; nothing is applied before you have read it.");
  }

  const input = JSON.parse(move.payload) as RewriteMove;
  const meta = JSON.parse(move.draftMeta) as DraftMeta;
  const { chapter } = await loadChapter(ctx.bookId, input.chapterId, input.chapterNumber);
  if (!chapter) return fail("chapter_not_found", "The chapter this move was written for no longer exists.");

  const docs = new DocumentService(ctx.userId, ctx.bookId);
  const text = await readChapterText(docs, chapter.chapterNumber);
  if (text.docId !== meta.baseDocId || text.version !== meta.baseVersion) {
    return fail(
      "chapter_edited",
      "The chapter changed after this draft was made. Discard the draft and make a new one."
    );
  }

  let rewriteVersion: number | undefined;
  try {
    const saved = await docs.update(text.docId, move.draft, undefined, "agent_write", CHANGE_SOURCE, text.version);
    rewriteVersion = saved?.version?.version;
  } catch (error) {
    console.error(`[structure] draft of move ${moveId} could not be written:`, error);
    return fail("chapter_edited", "The chapter changed while the draft was being applied. Nothing was replaced.");
  }

  const summary =
    input.kind === "hook"
      ? `Rewrote the ${input.scope ?? "ending"} of chapter ${chapter.chapterNumber}.`
      : `${input.kind === "trim" ? "Trimmed" : "Expanded"} chapter ${chapter.chapterNumber} from ${meta.baseWords} to ${meta.draftWords} words.`;
  try {
    await db.$transaction(async (tx) => {
      await tx.chapter.update({ where: { id: chapter.id }, data: { wordCount: meta.draftWords } });
      // The chapter's opening or ending changed: the old rating no longer describes it.
      await tx.chapterHookRating.deleteMany({ where: { chapterId: chapter.id } });
      await reconcileBookCounters(ctx.bookId, tx);
      const now = new Date();
      const { count } = await tx.structureMove.updateMany({
        where: { id: moveId, status: "drafted" },
        data: {
          status: "applied",
          previousState: JSON.stringify({
            ordering: [],
            sourceChapterId: chapter.id,
            sourceContent: text.content,
            sourceWordCount: chapter.wordCount,
            rewriteVersion,
          }),
          resultSummary: summary,
          decidedAt: now,
          appliedAt: now,
        },
      });
      if (count === 0) throw new Error("move no longer drafted");
    });
  } catch (error) {
    console.error(`[structure] move ${moveId} could not be committed; putting the chapter back:`, error);
    // Only over the version this apply wrote: without it, a put-back could
    // overwrite a save the writer made in between.
    if (rewriteVersion === undefined) {
      return fail(
        "apply_failed",
        "The draft was written but the change could not be recorded. The previous text is in the chapter's version history."
      );
    }
    try {
      await docs.update(text.docId, text.content, undefined, "agent_write", CHANGE_SOURCE, rewriteVersion);
    } catch (putBack) {
      console.error("[structure] could not put the chapter back:", putBack);
      return fail(
        "apply_failed",
        "The draft was written but the change could not be recorded. The previous text is in the chapter's version history."
      );
    }
    return fail("apply_failed", "The change could not be saved, so the chapter was left as it was.");
  }
  return { ok: true, summary };
}

/** Undo an applied trim/expand: the original prose and word count come back. */
export async function restoreRewrite(
  ctx: RewriteContext,
  previous: { sourceChapterId?: string; sourceContent?: string; sourceWordCount?: number; rewriteVersion?: number }
): Promise<void> {
  if (!previous.sourceChapterId || previous.sourceContent === undefined) {
    throw new Error("This change has no record of the chapter it replaced.");
  }
  const { chapter } = await loadChapter(ctx.bookId, previous.sourceChapterId, -1);
  if (!chapter) throw new Error("The chapter this change was applied to no longer exists.");
  const docs = new DocumentService(ctx.userId, ctx.bookId);
  const text = await readChapterText(docs, chapter.chapterNumber);
  if (!text.docId) throw new RewriteEditedError();

  // A previous undo may have restored the prose and then failed on the count:
  // finish it instead of refusing it forever.
  if (text.content !== previous.sourceContent) {
    if (text.version !== previous.rewriteVersion) throw new RewriteEditedError();
    await docs.update(text.docId, previous.sourceContent, undefined, "agent_write", CHANGE_SOURCE, text.version);
  }
  await db.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapter.id },
      data: { wordCount: previous.sourceWordCount ?? countWords(previous.sourceContent ?? "") },
    });
    await reconcileBookCounters(ctx.bookId, tx);
  });
}

/** Drop a draft the writer does not want; the move waits again. */
export async function discardRewriteDraft(moveId: string, bookId: string): Promise<boolean> {
  const { count } = await db.structureMove.updateMany({
    where: { id: moveId, bookId, status: "drafted" },
    data: { status: "pending", draft: null, draftMeta: null },
  });
  return count > 0;
}

/** The chapter's prose as it is now, for the before/after view of a draft. */
export async function readCurrentChapterText(
  ctx: RewriteContext,
  move: { chapterId?: string; chapterNumber: number }
): Promise<string> {
  const { chapter } = await loadChapter(ctx.bookId, move.chapterId, move.chapterNumber);
  if (!chapter) return "";
  const text = await readChapterText(new DocumentService(ctx.userId, ctx.bookId), chapter.chapterNumber);
  return text.content;
}
