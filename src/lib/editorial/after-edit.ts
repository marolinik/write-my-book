/**
 * The judged passes, run where findings are born.
 *
 * Triage shipped with a route and no caller, so nothing a writer did ever
 * ranked anything. At the end of an editorial session the chapter's findings
 * are fresh, the prose is current, and the writer is about to open Lektura:
 * that is when to judge.
 *
 * Hand-applied notes are checked first. The stock-prose pass runs before
 * triage because it writes findings, and triage must see them. Each pass
 * switches itself off without its env flag, and none may fail the session
 * that called it.
 */

const STOCK_PROSE_WORKFLOWS = new Set(["line-edit"]);
const TRIAGE_WORKFLOWS = new Set(["line-edit", "dev-edit"]);

export async function judgeChapterAfterEdit(input: {
  workflowId: string;
  bookId: string;
  chapterNumber: number;
  sessionId: string;
}): Promise<void> {
  const { workflowId, bookId, chapterNumber, sessionId } = input;

  // Notes the writer applied by hand since the last pass: did they hold?
  // First, so a fix that did not hold is known before new notes pile on.
  if (TRIAGE_WORKFLOWS.has(workflowId)) {
    try {
      const { checkChapterHandFixes } = await import("./fix-check-service");
      await checkChapterHandFixes({ bookId, chapterNumber });
    } catch (error) {
      console.error("[AfterEdit] hand-fix check failed (non-fatal):", error instanceof Error ? error.message : error);
    }
  }

  if (STOCK_PROSE_WORKFLOWS.has(workflowId)) {
    try {
      const { checkChapterStockProse } = await import("./stock-prose-service");
      await checkChapterStockProse({ bookId, chapterNumber, sessionId });
    } catch (error) {
      console.error("[AfterEdit] stock-prose pass failed (non-fatal):", error instanceof Error ? error.message : error);
    }
  }

  if (TRIAGE_WORKFLOWS.has(workflowId)) {
    try {
      const { triageChapter } = await import("./triage-service");
      await triageChapter({ bookId, chapterNumber });
    } catch (error) {
      console.error("[AfterEdit] triage failed (non-fatal):", error instanceof Error ? error.message : error);
    }
  }
}
