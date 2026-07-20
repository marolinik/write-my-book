/**
 * D-20 spot-check — POST a chapter with an already-used chapterNumber.
 * The book auto-created Chapter 1 on create, and the fixture added 2 & 3.
 * Re-POSTing chapterNumber 1 (and 2) must return a clean 409 envelope,
 * NOT a raw 500 and NOT a silent auto-create/duplicate.
 * Also probe a malformed body and a valid new number for contrast.
 */
import { api, nowIso } from "./_helper";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");

async function main() {
  const fixture = JSON.parse(readFileSync(join(OUT, "fixture.json"), "utf8"));
  const bookId = fixture.bookId as string;

  const traces: Record<string, unknown> = { ts: nowIso(), bookId };

  // 1) duplicate chapterNumber 1 (auto-created)
  const dup1 = await api("POST", `/api/books/${bookId}/chapters`, {
    actNumber: 1,
    chapterNumber: 1,
    title: "Collision on Ch1",
  });
  traces.duplicate_ch1 = {
    status: dup1.status,
    latencyMs: dup1.latencyMs,
    body: dup1.body,
  };

  // 2) duplicate chapterNumber 2 (fixture-created)
  const dup2 = await api("POST", `/api/books/${bookId}/chapters`, {
    actNumber: 1,
    chapterNumber: 2,
    title: "Collision on Ch2",
  });
  traces.duplicate_ch2 = {
    status: dup2.status,
    latencyMs: dup2.latencyMs,
    body: dup2.body,
  };

  // 3) verify no phantom chapter was created (list still == 3)
  const list = await api<unknown[]>("GET", `/api/books/${bookId}/chapters`);
  traces.chapterCountAfter = Array.isArray(list.body) ? list.body.length : "n/a";

  // 4) contrast: a brand-new number should still succeed (201)
  const fresh = await api("POST", `/api/books/${bookId}/chapters`, {
    actNumber: 1,
    chapterNumber: 9,
    title: "Fresh Ch9 (contrast control)",
  });
  traces.fresh_ch9 = {
    status: fresh.status,
    latencyMs: fresh.latencyMs,
    body: fresh.body,
  };

  const verdict = {
    duplicate_returns_409:
      dup1.status === 409 && dup2.status === 409,
    not_500: dup1.status !== 500 && dup2.status !== 500,
    no_phantom_created: traces.chapterCountAfter === 3, // before the fresh ch9
    fresh_still_201: fresh.status === 201,
  };
  traces.verdict = verdict;

  writeFileSync(
    join(OUT, "api-traces", "d20-chapter-collision.json"),
    JSON.stringify(traces, null, 2)
  );
  console.log(JSON.stringify(traces, null, 2));
}

main().catch((e) => {
  console.error("D20 ERROR", e);
  process.exit(1);
});
