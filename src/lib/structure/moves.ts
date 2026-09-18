/**
 * O12 — structural revision pass. Pure planners for the four structural moves a
 * developmental editor proposes: reorder, renumber, merge and split.
 *
 * Nothing here touches the database or the document store. A move is resolved
 * into an explicit ordering (and, for merge/split, the exact prose result) so
 * that:
 *   - the writer can be shown a real before/after before accepting,
 *   - the apply transaction has no decisions left to make,
 *   - every rule is unit-testable without a live book.
 *
 * Inputs are never mutated; every planner returns new arrays.
 */

export type MoveKind = "reorder" | "renumber" | "merge" | "split";

export interface ChapterRef {
  id: string;
  chapterNumber: number;
  title: string | null;
  wordCount: number;
  actNumber: number;
}

export interface ReorderMove {
  kind: "reorder" | "renumber";
  /**
   * The chapter being moved. The id is the identity; the number is what it
   * happened to carry when the move was proposed and may have shifted since
   * (S3-8). Older proposals carry the number alone.
   */
  chapterId?: string;
  chapterNumber: number;
  /** 1-based position it should end up at. */
  targetPosition: number;
}

export interface MergeMove {
  kind: "merge";
  /** The chapters being merged, by identity. Preferred over the numbers. */
  chapterIds?: string[];
  /** Two or more chapters, adjacent in reading order. Order-insensitive. */
  chapterNumbers: number[];
  /** Optional title for the merged chapter. */
  title?: string;
}

export interface SplitMove {
  kind: "split";
  /** The chapter being split, by identity. Preferred over the number. */
  chapterId?: string;
  chapterNumber: number;
  /** Verbatim quote where the second chapter should begin. */
  anchorQuote: string;
  /** Optional titles for the two halves. */
  firstTitle?: string;
  secondTitle?: string;
}

export type StructureMoveInput = ReorderMove | MergeMove | SplitMove;

export interface OrderingEntry {
  chapterId: string;
  chapterNumber: number;
}

export interface MovePlan {
  /** Full new ordering to hand to the atomic renumber. Empty when nothing moves. */
  ordering: OrderingEntry[];
  /** Chapters that cease to exist (merge only). */
  removedChapterIds: string[];
  /** The chapter that absorbs the others (merge only). */
  survivorChapterId?: string;
  /** Number the newly created chapter takes (split only). */
  newChapterNumber?: number;
  /** The chapter the move acted on (reorder/split). */
  sourceChapterId?: string;
}

export type MoveErrorCode =
  | "chapter_not_found"
  | "target_out_of_range"
  | "no_op"
  | "needs_two_chapters"
  | "not_adjacent"
  | "anchor_required"
  | "anchor_not_found"
  | "anchor_ambiguous"
  | "anchor_too_early"
  | "unknown_kind"
  // Apply-time (O12 phase 2) — the move was valid when proposed but cannot run now.
  | "move_not_found"
  | "not_pending"
  | "not_applied"
  | "content_missing"
  | "apply_failed";

export interface MoveError {
  code: MoveErrorCode;
  message: string;
}

export type PlanResult =
  | { ok: true; plan: MovePlan }
  | { ok: false; error: MoveError };

export type SplitResult =
  | { ok: true; first: string; second: string }
  | { ok: false; error: MoveError };

const SCENE_BREAK = "* * *";

function fail(code: MoveErrorCode, message: string): { ok: false; error: MoveError } {
  return { ok: false, error: { code, message } };
}

/** Reading order — the chapter list sorted by number, never mutated in place. */
function inReadingOrder(chapters: readonly ChapterRef[]): ChapterRef[] {
  return [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function renumberFrom(list: readonly ChapterRef[]): OrderingEntry[] {
  return list.map((c, i) => ({ chapterId: c.id, chapterNumber: i + 1 }));
}

/**
 * Resolve a proposed move against the current chapter list. Returns the plan the
 * apply engine executes, or the reason the move is impossible.
 */
/**
 * Rewrites a move's chapter numbers from the ids it carries.
 *
 * A proposal is written against the book as it stood, then sits on the panel
 * while the writer accepts other moves — each of which renumbers everything
 * below it. Re-planning at accept time is only honest if the move still points
 * at the same CHAPTER, so the id wins wherever there is one (S3-8).
 */
function resolveByIdentity(
  chapters: readonly ChapterRef[],
  move: StructureMoveInput
): StructureMoveInput | MoveError {
  const byId = new Map(chapters.map((c) => [c.id, c]));

  if (move.kind === "merge" && move.chapterIds?.length) {
    const numbers: number[] = [];
    for (const id of move.chapterIds) {
      const chapter = byId.get(id);
      if (!chapter) {
        return {
          code: "chapter_not_found",
          message: "A chapter this move was written for no longer exists.",
        };
      }
      numbers.push(chapter.chapterNumber);
    }
    return { ...move, chapterNumbers: numbers };
  }

  if (move.kind !== "merge" && move.chapterId) {
    const chapter = byId.get(move.chapterId);
    if (!chapter) {
      return {
        code: "chapter_not_found",
        message: "The chapter this move was written for no longer exists.",
      };
    }
    return { ...move, chapterNumber: chapter.chapterNumber };
  }

  return move;
}

export function planMove(
  chapters: readonly ChapterRef[],
  input: StructureMoveInput
): PlanResult {
  const resolved = resolveByIdentity(chapters, input);
  if ("code" in resolved) return { ok: false, error: resolved };
  const move = resolved;

  switch (move.kind) {
    case "reorder":
    case "renumber":
      return planReorder(chapters, move);
    case "merge":
      return planMerge(chapters, move);
    case "split":
      return planSplit(chapters, move);
    default:
      return fail("unknown_kind", `Unknown move kind: ${(move as { kind: string }).kind}`);
  }
}

export function planReorder(
  chapters: readonly ChapterRef[],
  move: ReorderMove
): PlanResult {
  const list = inReadingOrder(chapters);
  const index = list.findIndex((c) => c.chapterNumber === move.chapterNumber);
  if (index === -1) {
    return fail("chapter_not_found", `Chapter ${move.chapterNumber} does not exist.`);
  }
  if (
    !Number.isInteger(move.targetPosition) ||
    move.targetPosition < 1 ||
    move.targetPosition > list.length
  ) {
    return fail(
      "target_out_of_range",
      `Target position ${move.targetPosition} is outside 1..${list.length}.`
    );
  }
  if (move.targetPosition === index + 1) {
    return fail("no_op", `Chapter ${move.chapterNumber} is already at that position.`);
  }

  const moved = list[index];
  const without = list.filter((_, i) => i !== index);
  const reordered = [
    ...without.slice(0, move.targetPosition - 1),
    moved,
    ...without.slice(move.targetPosition - 1),
  ];

  return { ok: true, plan: { ordering: renumberFrom(reordered), removedChapterIds: [] } };
}

export function planMerge(
  chapters: readonly ChapterRef[],
  move: MergeMove
): PlanResult {
  const wanted = [...new Set(move.chapterNumbers)].sort((a, b) => a - b);
  if (wanted.length < 2) {
    return fail("needs_two_chapters", "A merge needs at least two distinct chapters.");
  }

  const list = inReadingOrder(chapters);
  const positions: number[] = [];
  for (const n of wanted) {
    const at = list.findIndex((c) => c.chapterNumber === n);
    if (at === -1) return fail("chapter_not_found", `Chapter ${n} does not exist.`);
    positions.push(at);
  }

  // Adjacency by position, not by number: an imported manuscript can have holes
  // in its numbering, and number arithmetic would pass a merge across the gap.
  const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (!contiguous) {
    return fail(
      "not_adjacent",
      `Chapters ${wanted.join(", ")} are not next to each other in reading order.`
    );
  }

  const survivor = list[positions[0]];
  const removed = positions.slice(1).map((p) => list[p]);
  const removedIds = new Set(removed.map((c) => c.id));
  const remaining = list.filter((c) => !removedIds.has(c.id));

  return {
    ok: true,
    plan: {
      ordering: renumberFrom(remaining),
      removedChapterIds: removed.map((c) => c.id),
      survivorChapterId: survivor.id,
    },
  };
}

export function planSplit(
  chapters: readonly ChapterRef[],
  move: SplitMove
): PlanResult {
  const list = inReadingOrder(chapters);
  const source = list.find((c) => c.chapterNumber === move.chapterNumber);
  if (!source) {
    return fail("chapter_not_found", `Chapter ${move.chapterNumber} does not exist.`);
  }
  if (!move.anchorQuote || move.anchorQuote.trim().length === 0) {
    return fail("anchor_required", "A split needs a verbatim anchor quote.");
  }

  const newChapterNumber = source.chapterNumber + 1;
  const shifts = list.some((c) => c.chapterNumber >= newChapterNumber);

  // Nothing after the split point means nothing to renumber — the new chapter
  // simply takes the next free number.
  const ordering: OrderingEntry[] = shifts
    ? list.map((c) => ({
        chapterId: c.id,
        chapterNumber:
          c.chapterNumber >= newChapterNumber ? c.chapterNumber + 1 : c.chapterNumber,
      }))
    : [];

  return {
    ok: true,
    plan: {
      ordering,
      removedChapterIds: [],
      newChapterNumber,
      sourceChapterId: source.id,
    },
  };
}

/** Strip a single leading ATX heading line from a chapter body. */
function withoutLeadingHeading(markdown: string): string {
  return markdown.replace(/^#{1,6}[^\n]*\n+/, "").trimStart();
}

/**
 * Join the bodies of merged chapters. Only the first chapter's title survives
 * (or an explicit one replaces it); every other heading is dropped so the merged
 * chapter has exactly one h1. Paragraphs are separated by a scene break so the
 * seam stays visible to the writer instead of silently welding two scenes.
 */
export function mergeContent(
  parts: readonly string[],
  opts?: { title?: string }
): string {
  const bodies = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  if (bodies.length === 0) return opts?.title ? `# ${opts.title}` : "";

  const [head, ...rest] = bodies;
  const first = opts?.title
    ? `# ${opts.title}\n\n${withoutLeadingHeading(head)}`.trim()
    : head;
  const tail = rest.map((p) => withoutLeadingHeading(p)).filter((p) => p.length > 0);

  return [first, ...tail].join(`\n\n${SCENE_BREAK}\n\n`);
}

/**
 * Cut a chapter in two at the paragraph the anchor quote appears in — the anchor's
 * paragraph opens the second half. The anchor must appear exactly once: a quote
 * the model half-remembered, or one that repeats, is refused rather than guessed,
 * because the wrong cut point silently rewrites the manuscript.
 */
export function splitContent(markdown: string, anchorQuote: string): SplitResult {
  const anchor = anchorQuote?.trim() ?? "";
  if (anchor.length === 0) {
    return fail("anchor_required", "A split needs a verbatim anchor quote.");
  }

  const occurrences = markdown.split(anchor).length - 1;
  if (occurrences === 0) {
    return fail("anchor_not_found", `The quote "${anchor}" is not in this chapter.`);
  }
  if (occurrences > 1) {
    return fail(
      "anchor_ambiguous",
      `The quote "${anchor}" appears ${occurrences} times — it does not identify one cut point.`
    );
  }

  const paragraphs = markdown.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const target = paragraphs.findIndex((p) => p.includes(anchor));
  if (target === -1) {
    // The anchor straddles a paragraph boundary (it contains a blank line).
    return fail("anchor_not_found", `The quote "${anchor}" spans a paragraph break.`);
  }

  // A leading title heading is not prose, so it does not count as "content before".
  const headingOffset = /^#{1,6}\s/.test(paragraphs[0]) ? 1 : 0;
  if (target - headingOffset <= 0) {
    return fail(
      "anchor_too_early",
      "The cut point is in the opening paragraph — the first half would be empty."
    );
  }

  return {
    ok: true,
    first: paragraphs.slice(0, target).join("\n\n"),
    second: paragraphs.slice(target).join("\n\n"),
  };
}
