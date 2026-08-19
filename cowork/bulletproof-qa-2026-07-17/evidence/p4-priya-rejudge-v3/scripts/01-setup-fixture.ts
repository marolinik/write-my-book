/**
 * Step 1 — build a small Priya book fixture: 3 chapters of real prose.
 * Creates a fresh book (name is timestamped so re-runs never 409), adds
 * chapters 2 and 3 (chapter 1 is auto-created on book create), and PUTs
 * a few-hundred-word chapter of prose into each. Writes fixture.json.
 */
import { api, nowIso } from "./_helper";
import { writeFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");

const CH1 = `The lighthouse had not shown a light in forty years, yet Priya climbed
its stairs every morning as though the keeper might still be waiting at the top.
The salt air had eaten the iron railings to lace. Each step complained under her
boots, a hundred and nine of them, and she counted every one aloud because her
grandmother had counted them, and her grandmother's mother before that.

At the lantern room she set down her satchel and unpacked the ledger. The glass
was fogged with brine and the far horizon looked like a smudged pencil line.
Somewhere out past the reef a fishing boat worked its nets, too small to name.
She wrote the date, the wind, the colour of the water. This was the whole of her
work now: to witness, and to write it down, so that the sea could not pretend it
had gone unwatched.

When she was a girl the light had felt like a promise. Now it felt like a debt
nobody remembered lending. She pressed her palm to the cold lens and, for a
moment, imagined it warm.`;

const CH2 = `The letter arrived on a Tuesday, folded twice and water-stained, addressed
in a hand Priya did not recognise. It had travelled a long way to reach the
lighthouse; the postmark was three towns distant and a month old. She read it
standing in the doorway with the wind trying to take it from her fingers.

It was from a man who claimed to be the grandson of the last keeper. He wrote
that his grandfather had left something in the walls, a box, and that he was
dying and wished to know it had been found. He did not ask for it back. He only
asked to be told it was safe. Priya read the letter four times, then folded it
into the ledger between yesterday and today.

That night she could not sleep. She lay listening to the building breathe, the
old timbers shifting like a person turning over, and she thought about all the
things people hid in walls so that some later stranger would have to decide what
they were worth. In the morning she would begin to look. She already knew she
would not stop until she found it.`;

const CH3 = `She found the box on the ninth day, behind a loose stone in the lantern room,
exactly where a keeper would keep the thing he loved most and trusted least to
memory. It was tin, no larger than a loaf of bread, and it did not rattle when
she lifted it. Rust had sealed the lid the way grief seals a mouth.

Inside were letters, dozens of them, none of them ever sent. They were addressed
to a woman named Meera, and they spanned eleven years, and every one of them
ended with the same sentence: the light is still burning, in case you are looking.
Priya sat on the cold floor and read until the sky went grey and then gold.

When she was done she understood the debt at last. The light had never been for
the ships. It had been for one woman who had promised to come back and had not,
and for one man who had refused to believe the sea would keep her. Priya carried
the box down the hundred and nine steps and, for the first time in forty years,
she left the lighthouse door standing open behind her.`;

async function main() {
  const started = nowIso();
  const bookName = `Priya v3 Recapture — The Lighthouse Ledger ${Date.now()}`;

  const book = await api<{ id: string; firstChapterId: string }>(
    "POST",
    "/api/books",
    { name: bookName, genre: "literary", language: "en" }
  );
  if (book.status !== 201) {
    console.error("BOOK CREATE FAILED", book.status, book.raw);
    process.exit(1);
  }
  const bookId = book.body.id;
  const ch1Id = book.body.firstChapterId;

  // Chapters 2 & 3 (chapter 1 auto-created on book create)
  const ch2 = await api<{ id: string }>(
    "POST",
    `/api/books/${bookId}/chapters`,
    { actNumber: 1, chapterNumber: 2, title: "The Letter" }
  );
  const ch3 = await api<{ id: string }>(
    "POST",
    `/api/books/${bookId}/chapters`,
    { actNumber: 1, chapterNumber: 3, title: "The Box" }
  );
  if (ch2.status !== 201 || ch3.status !== 201) {
    console.error("CHAPTER CREATE FAILED", ch2.status, ch3.status);
    process.exit(1);
  }

  // Content PUTs (first save — no expectedVersion needed)
  const p1 = await api(
    "PUT",
    `/api/books/${bookId}/chapters/${ch1Id}/content`,
    { markdown: CH1, changeSource: "user" }
  );
  const p2 = await api(
    "PUT",
    `/api/books/${bookId}/chapters/${ch2.body.id}/content`,
    { markdown: CH2, changeSource: "user" }
  );
  const p3 = await api(
    "PUT",
    `/api/books/${bookId}/chapters/${ch3.body.id}/content`,
    { markdown: CH3, changeSource: "user" }
  );

  const fixture = {
    started,
    finished: nowIso(),
    bookId,
    bookName,
    chapters: [
      { chapterNumber: 1, chapterId: ch1Id, put: p1.status, words: CH1.split(/\s+/).length },
      { chapterNumber: 2, chapterId: ch2.body.id, put: p2.status, words: CH2.split(/\s+/).length },
      { chapterNumber: 3, chapterId: ch3.body.id, put: p3.status, words: CH3.split(/\s+/).length },
    ],
    prose: { CH1, CH2, CH3 },
  };
  writeFileSync(join(OUT, "fixture.json"), JSON.stringify(fixture, null, 2));
  console.log(JSON.stringify({
    bookId,
    ch1Id,
    ch2Id: ch2.body.id,
    ch3Id: ch3.body.id,
    puts: [p1.status, p2.status, p3.status],
    bookCreateLatencyMs: book.latencyMs,
  }, null, 2));
}

main().catch((e) => {
  console.error("SETUP ERROR", e);
  process.exit(1);
});
