/**
 * Phase A2 — create the remaining chapters (2..N, ch1 already saved) and save
 * their content. Idempotent-ish: only creates chapters not already in state.
 */
import { call, saveState, loadState, log, BOOK1_CHAPTERS, BOOK2_CHAPTERS } from "./_lib";

const P3 = "user_qa_p3";

async function doBook(
  bookId: string,
  chapters: Record<number, string>,
  bookTag: string,
  chapterIds: Record<number, string>
): Promise<Record<number, string>> {
  const ids = { ...chapterIds };
  const nums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
  for (const n of nums) {
    if (n === 1) continue; // ch1 already created+saved
    if (!ids[n]) {
      const created = await call(
        "POST",
        `/api/books/${bookId}/chapters`,
        P3,
        { actNumber: 1, chapterNumber: n },
        `${bookTag}_create_ch${n}`
      );
      if (created.status !== 201) {
        log(`  ! create ch${n} failed`, created.status, JSON.stringify(created.body));
        continue;
      }
      ids[n] = (created.body as any).id;
    }
    const put = await call(
      "PUT",
      `/api/books/${bookId}/chapters/${ids[n]}/content`,
      P3,
      { markdown: chapters[n], changeSource: "user" },
      `${bookTag}_put_content_ch${n}`
    );
    log(`  ch${n}: create+save status=${put.status} words=${(put.body as any)?.wordCount}`);
  }
  return ids;
}

async function main() {
  const state = loadState();
  log("=== PHASE A2: remaining chapters ===", new Date().toISOString());
  log("[book1]");
  state.book1Chapters = await doBook(state.book1Id, BOOK1_CHAPTERS, "b1", state.book1Chapters);
  log("[book2]");
  state.book2Chapters = await doBook(state.book2Id, BOOK2_CHAPTERS, "b2", state.book2Chapters);
  saveState(state);
  log("\nchapters:", JSON.stringify({ b1: state.book1Chapters, b2: state.book2Chapters }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE A2 ERROR:", e);
  process.exit(1);
});
