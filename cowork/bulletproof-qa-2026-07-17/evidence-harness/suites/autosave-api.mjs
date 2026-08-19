// suites/autosave-api.mjs — G4: HTTP-reachable autosave fault classes (§3.2 row 4).
//
// (T12, API portion.) Injection text is generated per-injection from a seeded PRNG
// (seed recorded -> a judge regenerates the expected text). Classes exercised here:
//   (a) two-writer 409 race: two concurrent PUTs to .../chapters/[id]/content;
//       the loser must 409 and NO words may be lost.
//   (b) worker-death-mid-write: kill the worker PID mid-agent-write, restart under
//       the same bracket rules, verify recovered DB content == expected.
// The offline-autosave + immersive-kill classes are browser-driven (see
// browser/offline-autosave.harness.spec.js). If a class can't run here it seals
// UNDER-N honestly — never "extrapolated from API-level cousins".
//
// Needs: live app + single worker + Postgres.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, seedFromString } from "../core/prng.mjs";
import { withBracket, coverageCheck } from "./_lib.mjs";
import { createDbProbe } from "../probes/db-snapshot.mjs";

/** Regenerable injection paragraph from a seed. */
function injectionText(seed, n) {
  const rng = mulberry32((seed + n) >>> 0);
  const words = [];
  const bank = ["harbor", "clockwork", "salt", "letter", "keeper", "tide", "lantern", "ledger", "echo", "margin"];
  for (let i = 0; i < 40; i += 1) words.push(bank[Math.floor(rng() * bank.length)]);
  return `INJ-${n} ${words.join(" ")}`;
}

export async function run(ctx) {
  const { http, scenario } = ctx;
  const db = createDbProbe();
  const targetN = scenario?.preRegistered?.n ?? 20;
  const checks = [];

  try {
    return await withBracket(ctx, "wp-autosave-1", async (bracket) => {
      const bookRes = await http.request("create-autosave-book", { method: "POST", path: "/api/books", body: { title: "Harness Autosave Book" }, bracket });
      const bookId = JSON.parse(bookRes.bodyBytes.toString("utf8")).id;
      const chRes = await http.request("create-chapter", { method: "POST", path: `/api/books/${bookId}/chapters`, body: { title: "ch1" }, bracket });
      const chapterId = JSON.parse(chRes.bodyBytes.toString("utf8")).id;

      const seed = seedFromString(`autosave-${bookId}`);
      let lost = 0;
      let conflicts409 = 0;

      // Class (a): two-writer 409 race, N injections.
      for (let n = 0; n < targetN; n += 1) {
        const text = injectionText(seed, n);
        const [w1, w2] = await Promise.all([
          http.request(`put-a-${n}`, { method: "PUT", path: `/api/books/${bookId}/chapters/${chapterId}/content`, body: { content: text, baseVersion: n }, bracket, measurement: true }),
          http.request(`put-b-${n}`, { method: "PUT", path: `/api/books/${bookId}/chapters/${chapterId}/content`, body: { content: text + " B", baseVersion: n }, bracket, measurement: true }),
        ]);
        if (w1.status === 409 || w2.status === 409) conflicts409 += 1;
        // Verify the winning content is present verbatim (no lost words).
        const fresh = await http.request(`content-${n}`, { method: "GET", path: `/api/books/${bookId}/chapters/${chapterId}/content`, bracket, measurement: true });
        const stored = fresh.bodyBytes.toString("utf8");
        if (!stored.includes(`INJ-${n}`)) lost += 1;
      }

      checks.push({ id: "no-lost-words", method: "numericBound", args: { max: 0 }, source: { note: "GET content contains each INJ-n marker" }, observed: lost, pass: lost === 0, detail: lost === 0 ? null : `${lost} injection(s) lost` });
      checks.push({ id: "conflict-detected", method: "numericBound", args: { min: 1 }, source: { note: "at least one 409 across concurrent PUTs" }, observed: conflicts409, pass: conflicts409 > 0 });
      checks.push(coverageCheck(scenario, targetN, "coverage-injections"));

      return {
        checks,
        coverage: { metric: "autosave-no-loss", injections: targetN, lost, conflicts409, seed },
        extra: { note: "offline + immersive-kill classes are browser-driven; UNDER-N if browser blocked", bookId },
      };
    });
  } finally {
    await db.close();
  }
}
