/**
 * Phase A — Setup via REAL HTTP API (as P3). Creates the series + 2 books +
 * chapters and saves canonical prose. Captures masked API traces. Persists IDs.
 */
import {
  call,
  saveState,
  loadState,
  log,
  BOOK1_NAME,
  BOOK2_NAME,
  SERIES_TITLE,
  BOOK1_CHAPTERS,
  BOOK2_CHAPTERS,
} from "./_lib";

const P3 = "user_qa_p3";

async function ensureChaptersAndContent(
  bookId: string,
  firstChapterId: string,
  chapters: Record<number, string>,
  bookTag: string,
  state: any
): Promise<Record<number, string>> {
  const chapterIds: Record<number, string> = { 1: firstChapterId };
  const nums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
  for (const n of nums) {
    if (n !== 1) {
      const created = await call(
        "POST",
        `/api/books/${bookId}/chapters`,
        P3,
        { actNumber: 1, chapterNumber: n, title: null },
        `${bookTag}_create_ch${n}`
      );
      if (created.status !== 201) {
        log(`  ! create ch${n} failed`, created.status, created.body);
        continue;
      }
      chapterIds[n] = (created.body as any).id;
    }
    // Save content (first save → create path, no version needed).
    const put = await call(
      "PUT",
      `/api/books/${bookId}/chapters/${chapterIds[n]}/content`,
      P3,
      { markdown: chapters[n], changeSource: "user" },
      `${bookTag}_put_content_ch${n}`
    );
    log(`  ch${n} content saved: status=${put.status} words=${(put.body as any)?.wordCount}`);
  }
  return chapterIds;
}

async function main() {
  const state = loadState();
  log("=== PHASE A: SETUP (HTTP as P3) ===", new Date().toISOString());

  // 1. Series
  const series = await call(
    "POST",
    "/api/series",
    P3,
    { title: SERIES_TITLE, genre: "fantasy", seriesType: "DUOLOGY", plannedBooks: 2 },
    "01_create_series"
  );
  log("series:", series.status, (series.body as any)?.id ?? series.body);
  if (series.status !== 201) throw new Error("series create failed");
  state.seriesId = (series.body as any).id;

  // 2. Book 1 (rich create path → auto chapter 1 + settings)
  const b1 = await call(
    "POST",
    "/api/books",
    P3,
    { name: BOOK1_NAME, seriesId: state.seriesId, bookNumber: 1, genre: "fantasy" },
    "02_create_book1"
  );
  log("book1:", b1.status, (b1.body as any)?.id);
  if (b1.status !== 201) throw new Error("book1 create failed: " + JSON.stringify(b1.body));
  state.book1Id = (b1.body as any).id;
  state.book1FirstChapterId = (b1.body as any).firstChapterId;

  // 3. Book 2
  const b2 = await call(
    "POST",
    "/api/books",
    P3,
    { name: BOOK2_NAME, seriesId: state.seriesId, bookNumber: 2, genre: "fantasy" },
    "03_create_book2"
  );
  log("book2:", b2.status, (b2.body as any)?.id);
  if (b2.status !== 201) throw new Error("book2 create failed: " + JSON.stringify(b2.body));
  state.book2Id = (b2.body as any).id;
  state.book2FirstChapterId = (b2.body as any).firstChapterId;

  // 4. Chapters + content
  log("[book1 chapters]");
  state.book1Chapters = await ensureChaptersAndContent(
    state.book1Id,
    state.book1FirstChapterId,
    BOOK1_CHAPTERS,
    "b1",
    state
  );
  log("[book2 chapters]");
  state.book2Chapters = await ensureChaptersAndContent(
    state.book2Id,
    state.book2FirstChapterId,
    BOOK2_CHAPTERS,
    "b2",
    state
  );

  saveState(state);
  log("\nSTATE:", JSON.stringify(state, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE A ERROR:", e);
  process.exit(1);
});
