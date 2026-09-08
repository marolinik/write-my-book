// src/lib/book/progress.ts
//
// UDG round-4 (Viktor/Milica): per-book completion percent shown on the
// dashboard card. Kept dependency-free and pure so it can be unit-tested.
//
// Rule: if a book has a settable target word count, use words/target. Otherwise
// fall back to the status ladder (every book has a status, so % always renders).

export const BOOK_STATUS_PCT: Record<string, number> = {
  concept: 0,
  planning: 25,
  writing: 50,
  editing: 75,
  beta: 90,
  export: 100,
  complete: 100,
};

export function bookProgressPercent(input: {
  status: string;
  wordCount: number;
  targetWordCount: number | null;
}): number {
  if (input.targetWordCount && input.targetWordCount > 0) {
    return Math.min(
      Math.round((input.wordCount / input.targetWordCount) * 100),
      100
    );
  }
  return BOOK_STATUS_PCT[input.status] ?? 0;
}