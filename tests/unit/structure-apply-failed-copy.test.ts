import { describe, it, expect } from "vitest";
import { describeMoveError } from "@/components/reports/describe-move-error";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P6-S10: when the database refused a move, the panel printed the engine's
 * message, and the engine's message was the raw Prisma error — "Invalid
 * `ops.push(__TURBOPACK__imported__module__...` — in the middle of a Serbian
 * screen. The engine now keeps the detail for the log, and the panel says in
 * the writer's language what matters: nothing in the book was changed.
 */
describe("describeMoveError — apply_failed", () => {
  it("answers in the writer's language, whatever the engine sent", () => {
    for (const lang of ["sr", "en", "de"]) {
      const s = getUIStrings(lang).structure as unknown as Record<string, string>;
      const text = describeMoveError(
        "apply_failed",
        "Invalid `ops.push(__TURBOPACK__imported__module__...` invocation",
        s
      );
      expect(text).toBe(s.errApplyFailed);
      expect(text).not.toMatch(/TURBOPACK|invocation/);
    }
  });
});

/**
 * Review of a07a2f2: undoing a split deleted the chapter it had created, and
 * every version of that chapter's prose with it — including whatever the
 * writer had written there since. Undo now refuses, and the writer is told why
 * in their own language rather than being shown the engine's English note.
 */
describe("describeMoveError — split_edited", () => {
  it("has its own sentence in every language", () => {
    for (const lang of ["sr", "en", "de", "es", "fr", "ru", "zh"]) {
      const s = getUIStrings(lang).structure as unknown as Record<string, string>;
      const text = describeMoveError("split_edited", "engine note", s);
      expect(s.errSplitEdited).toBeTruthy();
      expect(text).toBe(s.errSplitEdited);
    }
  });
});
