/**
 * P4 setup + D-18 (chapter-collision) live repro + chapter seeding.
 * No LLM spend. Writes _state.json for the batch scripts.
 */
import { api, dump, writeState } from "./_client";

function prose(n: number): string {
  return (
    `# Chapter ${n}\n\n` +
    `The lantern guttered as Priya climbed the last of the tower stairs. ` +
    `She had run this route a hundred times, but tonight the stones felt colder, ` +
    `as if the keep itself had been holding its breath. At the top, the door stood ` +
    `open a hand's width, and lamplight spilled across the landing in a thin gold line.\n\n` +
    `"You came," said the voice inside. It was not a question. Priya pushed the door ` +
    `and stepped through, one hand still on the hilt she had promised herself she would ` +
    `not draw. The room was small and warm and full of maps, and at its center a woman ` +
    `she had believed dead for three winters looked up from the table and smiled a ` +
    `crooked, tired smile. "We have very little time," the woman went on, "and a great ` +
    `deal to undo. Sit. Listen. Then decide whether you still hate me by morning."`
  );
}

async function main(): Promise<void> {
  console.log("=== P4 setup + D-18 repro ===");

  const booksBefore = await api("GET", "/api/books");
  dump("00_books_before", booksBefore);
  console.log(
    `GET /api/books -> ${booksBefore.status} (count=${Array.isArray(booksBefore.json) ? (booksBefore.json as unknown[]).length : "?"})`
  );

  const sub = await api<Record<string, unknown>>("GET", "/api/billing/subscription");
  dump("00_subscription", sub);
  console.log(`subscription -> ${sub.status} plan=${sub.json?.plan} status=${sub.json?.status}`);

  const keys = await api<Array<Record<string, unknown>>>("GET", "/api/settings/api-keys");
  // Mask: never dump raw key material. Reduce to provider + validated flag only.
  const masked = Array.isArray(keys.json)
    ? keys.json.map((k) => ({ provider: k.provider, validated: !!k.validatedAt }))
    : keys.json;
  dump("00_apikeys_masked", { status: keys.status, keys: masked });
  console.log(`api-keys -> ${keys.status} ${JSON.stringify(masked)}`);

  const bookName = `Priya Rejudge ${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const created = await api<Record<string, string>>("POST", "/api/books", {
    name: bookName,
    genre: "Fantasy",
  });
  dump("01_book_create", created);
  const bookId = created.json?.id as string | undefined;
  const firstChapterId = created.json?.firstChapterId as string | undefined;
  console.log(
    `POST /api/books -> ${created.status} bookId=${bookId} firstChapterId=${firstChapterId}`
  );
  if (!bookId || !firstChapterId) throw new Error("book create failed; aborting");

  // ── D-18 repro: POST chapter#1 collides with the auto-created placeholder ──
  const collide = await api("POST", `/api/books/${bookId}/chapters`, {
    actNumber: 1,
    chapterNumber: 1,
    title: "Collision probe",
  });
  dump("02_d18_chapter1_collision", {
    note:
      "POST chapterNumber:1 collides with book-create's auto-placeholder chapter 1. " +
      "Baseline (p4-priya, p3-selena D-20): raw 500. Checking whether it is now a clean 4xx.",
    request: { actNumber: 1, chapterNumber: 1, title: "Collision probe" },
    response: collide,
  });
  console.log(
    `D-18 POST chapter#1 collision -> ${collide.status} : ${JSON.stringify(collide.json ?? collide.text)}`
  );

  // ── Seed content: ch1 (existing placeholder) + ch2, ch3 (new) ──
  const seedResults: Array<Record<string, unknown>> = [];

  const c1 = await api("PUT", `/api/books/${bookId}/chapters/${firstChapterId}/content`, {
    markdown: prose(1),
    changeSource: "import",
  });
  seedResults.push({ chapter: 1, action: "put-content", status: c1.status, body: c1.json });

  for (const n of [2, 3]) {
    const ch = await api<Record<string, string>>("POST", `/api/books/${bookId}/chapters`, {
      actNumber: 1,
      chapterNumber: n,
      title: `Chapter ${n}`,
    });
    seedResults.push({ chapter: n, action: "create", status: ch.status, id: ch.json?.id });
    const chId = ch.json?.id as string | undefined;
    if (chId) {
      const cc = await api("PUT", `/api/books/${bookId}/chapters/${chId}/content`, {
        markdown: prose(n),
        changeSource: "import",
      });
      seedResults.push({ chapter: n, action: "put-content", status: cc.status, body: cc.json });
    }
  }
  dump("03_seed_results", seedResults);

  const chaptersAfter = await api("GET", `/api/books/${bookId}/chapters`);
  dump("03_chapters_after_seed", chaptersAfter);
  const chCount = Array.isArray(chaptersAfter.json) ? (chaptersAfter.json as unknown[]).length : 0;
  console.log(`chapters after seed -> ${chaptersAfter.status} count=${chCount}`);

  writeState({ bookId, firstChapterId, bookName, createdAt: new Date().toISOString() });
  console.log(`\nSTATE written. bookId=${bookId}`);
}

main().catch((e) => {
  console.error("FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});
