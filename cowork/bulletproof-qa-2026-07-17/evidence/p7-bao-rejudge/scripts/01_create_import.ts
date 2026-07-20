import { apiJson, flushTraces, saveJson } from "./lib";
import { genBook, BOOK_NAME } from "./prose";

const CHAPTERS = 16;
const WORDS_PER = 3200;

async function main() {
  // 1. Create the book (diacritic-heavy name).
  const create = await apiJson("create-book", "POST", "/api/books", {
    name: BOOK_NAME,
    genre: "literary",
    language: "en",
  });
  if (create.status !== 201) {
    console.error("create-book failed", create.status, create.text.slice(0, 300));
    flushTraces("01-create-import.json");
    process.exit(1);
  }
  const bookId: string = create.json.id;
  const firstChapterId: string = create.json.firstChapterId;
  console.log("bookId", bookId, "firstChapterId", firstChapterId);

  // 2. Generate long diacritic prose and structured-import all chapters.
  const chapters = genBook(CHAPTERS, WORDS_PER);
  const expectedTotalWords = chapters.reduce((s, c) => s + c.wordCount, 0);
  const importPayload = {
    actNumber: 1,
    chapters: chapters.map((c) => ({
      number: c.number,
      title: c.title,
      content: c.content,
      action: "create" as const,
    })),
  };
  const imp = await apiJson("structured-import", "POST", `/api/books/${bookId}/import`, importPayload);
  console.log("import status", imp.status, "resp", JSON.stringify(imp.json));

  // 3. Read back book + chapters to confirm scale and pairing.
  const bookGet = await apiJson("get-book", "GET", `/api/books/${bookId}`);
  const chList = await apiJson("get-chapters", "GET", `/api/books/${bookId}/chapters`);

  // 4. Persist the exact expected content per chapter (source of truth for diffs)
  saveJson("expected-chapters.json", {
    bookId,
    firstChapterId,
    bookName: BOOK_NAME,
    chapterCount: CHAPTERS,
    wordsPerChapterTarget: WORDS_PER,
    expectedTotalWords,
    chapters: chapters.map((c) => ({
      number: c.number,
      title: c.title,
      wordCount: c.wordCount,
      sentinels: c.sentinels,
      contentSha: null,
      content: c.content,
    })),
  });

  saveJson("book-state.json", {
    bookId,
    firstChapterId,
    importResp: imp.json,
    bookWordCount: bookGet.json?.wordCount,
    bookChapterCount: bookGet.json?.chapters?.length,
    expectedTotalWords,
    chaptersFromApi: Array.isArray(chList.json)
      ? chList.json.map((c: any) => ({ id: c.id, chapterNumber: c.chapterNumber, title: c.title, wordCount: c.wordCount }))
      : chList.json,
  });

  console.log("EXPECTED total words:", expectedTotalWords);
  console.log("BOOK wordCount (api):", bookGet.json?.wordCount);
  flushTraces("01-create-import.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
