// P8 Rita rejudge — main adversarial probe driver.
// Focus: tier/quota gates, ownership fences, money-path, honest-4xx (no raw 500 / silent allow).
// Run: npx tsx --env-file=.env cowork/.../scripts/10-probe.ts
import { call, getJson, dumpResults } from "./lib";

function pick<T>(arr: T[] | undefined, i = 0): T | undefined {
  return Array.isArray(arr) ? arr[i] : undefined;
}

async function main() {
  const ts = Date.now();

  // ── Discovery ────────────────────────────────────────────────────────────
  const p1Books = (await getJson("p1", "/api/books")).json as any[];
  const p2Books = (await getJson("p2", "/api/books")).json as any[];
  const p3Books = (await getJson("p3", "/api/books")).json as any[];
  const p3Series = (await getJson("p3", "/api/series")).json as any[];

  const p1_book = pick(p1Books)?.id as string;
  const p2_book = pick(p2Books)?.id as string;
  const p3_book = pick(p3Books)?.id as string;
  const p3_series = pick(p3Series)?.id as string;

  // p1 chapter id
  const p1Chapters = (await getJson("p1", `/api/books/${p1_book}/chapters`)).json as any[];
  const p1_chapter = pick(p1Chapters)?.id as string;

  console.log("DISCOVERED", { p1_book, p1_chapter, p2_book, p3_book, p3_series });
  if (!p1_book || !p1_chapter || !p2_book || !p3_book || !p3_series) {
    throw new Error("discovery incomplete: " + JSON.stringify({ p1_book, p1_chapter, p2_book, p3_book, p3_series }));
  }

  // ══ Phase A — D-01 malformed JSON → 400 (was raw 500) ═════════════════════
  await call({ id: "A1", label: "d01-books-malformed-json", actor: "p3", method: "POST", path: "/api/books", rawBody: "{not valid json at all", expected: "400 (was 500 D-01)" });
  await call({ id: "A2", label: "d01-chapter-content-malformed", actor: "p1", method: "PUT", path: `/api/books/${p1_book}/chapters/${p1_chapter}/content`, rawBody: "not { json", expected: "400 (was 500 D-01)" });
  await call({ id: "A3", label: "d01-findings-malformed", actor: "p1", method: "POST", path: `/api/books/${p1_book}/editorial/findings`, rawBody: "{bad json", expected: "400 (extra route, D-01 arch)" });

  // ══ Phase B — Ownership sweep: p8 attacks p1-owned resources → 404 ═════════
  await call({ id: "B1", label: "own-book-get", actor: "p8", method: "GET", path: `/api/books/${p1_book}`, expected: "404 existence-hiding" });
  await call({ id: "B2", label: "own-chapters-get", actor: "p8", method: "GET", path: `/api/books/${p1_book}/chapters`, expected: "404" });
  await call({ id: "B3", label: "own-chapter-content-get", actor: "p8", method: "GET", path: `/api/books/${p1_book}/chapters/${p1_chapter}/content`, expected: "404" });
  await call({ id: "B4", label: "own-findings-get", actor: "p8", method: "GET", path: `/api/books/${p1_book}/editorial/findings`, expected: "404" });
  await call({ id: "B5", label: "own-memory-stats-idor", actor: "p8", method: "GET", path: `/api/memory/stats?bookId=${p1_book}`, expected: "404 (IDOR fix)" });
  await call({ id: "B6", label: "own-book-patch", actor: "p8", method: "PATCH", path: `/api/books/${p1_book}`, body: { name: "rita-hacked" }, expected: "404 (no cross-tenant write)" });
  await call({ id: "B7", label: "own-chapter-content-put", actor: "p8", method: "PUT", path: `/api/books/${p1_book}/chapters/${p1_chapter}/content`, body: { markdown: "rita overwrote your book" }, expected: "404 (no cross-tenant overwrite)" });
  await call({ id: "B8", label: "own-book-delete", actor: "p8", method: "DELETE", path: `/api/books/${p1_book}`, expected: "404 (no cross-tenant delete)" });
  await call({ id: "B9", label: "own-export-get", actor: "p8", method: "GET", path: `/api/books/${p1_book}/export`, expected: "404" });
  const b10 = await call({ id: "B10", label: "own-sanity-p1-still-owns", actor: "p1", method: "GET", path: `/api/books/${p1_book}`, expected: "200 (victim book intact after attacks)" });
  console.log("B10 sanity name:", (() => { try { return JSON.parse(b10.bodyText).name; } catch { return "?"; } })());

  // ══ Phase C — Deep composite-key fence (confused deputy) ═══════════════════
  // p2 seeds a victim lens; p3 (owns own book) targets that lens via its OWN book url.
  const cLens = await call({ id: "C0a", label: "seed-victim-lens-p2", actor: "p2", method: "POST", path: `/api/books/${p2_book}/style/lenses`, body: { characterName: `RJ Victim ${ts}`, sensoryPriority: "sight", metaphorDomain: "sea", interiorStyle: "terse", vocabularyRegister: "plain" }, expected: "201 (seed victim lens owned by p2)" });
  let p2_lens: string | undefined;
  try { p2_lens = JSON.parse(cLens.bodyText).id; } catch { /* */ }
  console.log("victim lens id:", p2_lens);
  if (p2_lens) {
    await call({ id: "C1", label: "deep-fence-p3book-x-p2lens", actor: "p3", method: "DELETE", path: `/api/books/${p3_book}/style/lenses/${p2_lens}`, expected: "404 (inner {id,bookId} fence; attacker owns URL book, victim's lens id)" });
    const c2 = await call({ id: "C2", label: "deep-fence-victim-intact", actor: "p2", method: "GET", path: `/api/books/${p2_book}/style/lenses`, expected: "200 victim lens still present" });
    const present = (() => { try { return (JSON.parse(c2.bodyText) as any[]).some((l) => l.id === p2_lens); } catch { return false; } })();
    console.log("victim lens still present after deep-fence attack:", present);
  }

  // ══ Phase D — Tier / plan gates (interpreted vs CURRENT plan config) ═══════
  // Free tier = maxBooks:1 (card-free on-ramp); series/analytics = Pro wall; batch = paid wall.
  const d1 = await call({ id: "D1", label: "gate-free-first-book-p8", actor: "p8", method: "POST", path: "/api/books", body: { name: `Rita RJ Free Book ${ts}` }, expected: "201 BY DESIGN (free card-free on-ramp = 1 book)" });
  let p8_book: string | undefined;
  try { p8_book = JSON.parse(d1.bodyText).id; } catch { /* */ }
  console.log("p8_book:", p8_book);
  await call({ id: "D2", label: "gate-free-second-book-p8-cap", actor: "p8", method: "POST", path: "/api/books", body: { name: `Rita RJ Free Book 2 ${ts}` }, expected: "403 (free cap = 1 book — NO bypass)" });
  await call({ id: "D3", label: "gate-free-p5-at-cap", actor: "p5", method: "POST", path: "/api/books", body: { name: `Sam RJ Overcap ${ts}` }, expected: "403 (p5 already at free cap)" });
  await call({ id: "D4", label: "gate-series-free-p8", actor: "p8", method: "POST", path: "/api/series", body: { title: `Rita RJ Series ${ts}` }, expected: "403 (series = Pro wall)" });
  await call({ id: "D5", label: "gate-series-indie-p1", actor: "p1", method: "POST", path: "/api/series", body: { title: `Maya RJ Series ${ts}` }, expected: "403 (indie blocked from series)" });
  const d6 = await call({ id: "D6", label: "gate-series-pro-p3-allow", actor: "p3", method: "POST", path: "/api/series", body: { title: `Selena RJ Series ${ts}` }, expected: "201 (professional positive control)" });
  console.log("p3 series create status:", d6.status);
  await call({ id: "D7", label: "gate-analytics-xtenant-p1", actor: "p1", method: "GET", path: `/api/series/${p3_series}/analytics`, expected: "404 (ownership fence before plan gate)" });
  await call({ id: "D8", label: "gate-analytics-owner-p3", actor: "p3", method: "GET", path: `/api/series/${p3_series}/analytics`, expected: "200 (owner professional control)" });

  // ══ Phase E — Batch: D-56 ownership-before-validation + run_batch 429 gate ══
  await call({ id: "E1", label: "batch-xtenant-valid-body", actor: "p8", method: "POST", path: `/api/books/${p1_book}/batch`, body: { workflowIds: ["dev-edit"], chapterStart: 1, chapterEnd: 1 }, expected: "404 (D-56 ownership fence)" });
  await call({ id: "E2", label: "batch-xtenant-malformed", actor: "p8", method: "POST", path: `/api/books/${p1_book}/batch`, rawBody: "{not json", expected: "404 (ownership BEFORE parse — no 400 oracle leak)" });
  await call({ id: "E3", label: "batch-xtenant-invalid-body", actor: "p8", method: "POST", path: `/api/books/${p1_book}/batch`, body: { workflowIds: [] }, expected: "404 (was 400 'Invalid input' — P8-03/D-56)" });
  await call({ id: "E4", label: "batch-owner-invalid-body", actor: "p1", method: "POST", path: `/api/books/${p1_book}/batch`, body: { workflowIds: [] }, expected: "400 (owner gets validation — uniform oracle proof)" });
  if (p8_book) {
    await call({ id: "E5", label: "batch-free-paidwall-429", actor: "p8", method: "POST", path: `/api/books/${p8_book}/batch`, body: { workflowIds: ["dev-edit"], chapterStart: 1, chapterEnd: 1 }, expected: "429 (run_batch paid wall on OWN free book — closes baseline coverage gap)" });
  }

  // ══ Phase F — D-15 wiki: honest 4xx, no empty-body 500 (owner p2) ═════════
  await call({ id: "F1", label: "d15-wiki-empty-body", actor: "p2", method: "POST", path: `/api/books/${p2_book}/wiki`, body: {}, expected: "400 enveloped (was 500 empty body)" });
  await call({ id: "F2", label: "d15-wiki-bad-enum", actor: "p2", method: "POST", path: `/api/books/${p2_book}/wiki`, body: { type: "not-a-real-entity-type", name: "x" }, expected: "400 (was 500 empty)" });
  await call({ id: "F3", label: "d15-wiki-null-name", actor: "p2", method: "POST", path: `/api/books/${p2_book}/wiki`, body: { type: "character", name: null }, expected: "400 (was 500 empty)" });
  await call({ id: "F4", label: "d15-wiki-get-bad-query", actor: "p2", method: "GET", path: `/api/books/${p2_book}/wiki?type=not-a-real-type`, expected: "400 (was 500 empty)" });
  const f5a = await call({ id: "F5a", label: "d15-wiki-create-valid", actor: "p2", method: "POST", path: `/api/books/${p2_book}/wiki`, body: { type: "character", name: `RJ Probe ${ts}` }, expected: "201 (valid create for PATCH repro)" });
  let wikiId: string | undefined;
  try { wikiId = JSON.parse(f5a.bodyText).id; } catch { /* */ }
  if (wikiId) {
    await call({ id: "F5b", label: "d15-wiki-patch-bad-enum-real-row", actor: "p2", method: "PATCH", path: `/api/books/${p2_book}/wiki/${wikiId}`, body: { type: "not-a-real-entity-type" }, expected: "400 against REAL owned row (was 500 empty)" });
    await call({ id: "F5c", label: "d15-wiki-cleanup-delete", actor: "p2", method: "DELETE", path: `/api/books/${p2_book}/wiki/${wikiId}`, expected: "200 cleanup" });
  }

  // ══ Phase G — D-14 style/lens: 400 not 401 on wrong-typed input (owner p2) ═
  await call({ id: "G1", label: "d14-style-wrongtype-fingerprint", actor: "p2", method: "POST", path: `/api/books/${p2_book}/style`, body: { name: `RJ Style ${ts}`, fingerprint: { nested: "obj" } }, expected: "400 (was 401 misclass)" });
  await call({ id: "G2", label: "d14-lens-wrongtype-sensory", actor: "p2", method: "POST", path: `/api/books/${p2_book}/style/lenses`, body: { characterName: `RJ ${ts}`, sensoryPriority: { x: "y" }, metaphorDomain: "a", interiorStyle: "b", vocabularyRegister: "c" }, expected: "400 (was 401 misclass)" });
  await call({ id: "G3", label: "d14-style-missing-name-control", actor: "p2", method: "POST", path: `/api/books/${p2_book}/style`, body: {}, expected: "400 (missing-field control — always was 400)" });

  // ══ Phase H — Key confidentiality + BYOK disclosure ═══════════════════════
  await call({ id: "H1", label: "key-p8-byok-masked", actor: "p8", method: "GET", path: "/api/settings/api-keys", expected: "200 maskedKey only, NO encryptedKey/plaintext" });
  await call({ id: "H2", label: "key-p1-masked", actor: "p1", method: "GET", path: "/api/settings/api-keys", expected: "200 maskedKey only" });

  // ══ Phase I — Money-path D-06 duplicate-checkout guard (subscribed p3) ═════
  await call({ id: "I1", label: "d06-checkout-double-bill-guard", actor: "p3", method: "POST", path: "/api/billing/checkout", body: { plan: "indie", billingInterval: "monthly" }, expected: "409 already_subscribed (was 200 + live checkout URL = double-bill D-06)" });
  await call({ id: "I2", label: "d06-checkout-malformed", actor: "p3", method: "POST", path: "/api/billing/checkout", rawBody: "{not json", expected: "400 (D-01 guard, no Stripe call)" });

  // ══ Phase J — Health honesty ══════════════════════════════════════════════
  await call({ id: "J1", label: "health", actor: "p8", method: "GET", path: "/api/health", expected: "200 real env status" });
  await call({ id: "J2", label: "health-deps", actor: "p8", method: "GET", path: "/api/health/dependencies", expected: "200/503 real per-dependency latencies" });

  // ══ Phase K — New adversarial probes ══════════════════════════════════════
  // K1/K2: series-level cross-tenant fence (p8 attacks p3's series)
  await call({ id: "K1", label: "xtenant-series-get", actor: "p8", method: "GET", path: `/api/series/${p3_series}`, expected: "404 (series ownership fence)" });
  await call({ id: "K2", label: "xtenant-series-books", actor: "p8", method: "GET", path: `/api/series/${p3_series}/books`, expected: "404" });
  // K3: cross-user seriesId smuggling — p2 makes a series, p3 tries to attach a new book to it
  const k3a = await call({ id: "K3a", label: "seed-series-p2", actor: "p2", method: "POST", path: "/api/series", body: { title: `RJ P2 Series ${ts}` }, expected: "201 (p2 professional seeds a series)" });
  let p2_series: string | undefined;
  try { p2_series = JSON.parse(k3a.bodyText).id; } catch { /* */ }
  if (p2_series) {
    await call({ id: "K3b", label: "xtenant-seriesId-smuggle", actor: "p3", method: "POST", path: "/api/books", body: { name: `RJ Smuggle ${ts}`, seriesId: p2_series }, expected: "404 Series not found (cannot attach book to another user's series)" });
  }
  // K-auth: persona selector is prefix-guarded — a non user_qa_* clerkId cannot impersonate an arbitrary victim.
  // rawClerkId is sent verbatim (no user_qa_ prefix) => auth.ts falls back to the fixed E2E_TEST_CLERK_ID user.
  const k4 = await call({ id: "K4", label: "auth-prefix-guard-nonqa", actor: "attacker", rawClerkId: "user_hackerman_admin", method: "GET", path: "/api/books", expected: "NOT an arbitrary victim's books — prefix guard forces fixed fallback user (or 401)" });
  const k4names = (() => { try { return (JSON.parse(k4.bodyText) as any[]).map((b) => b.name).slice(0, 3); } catch { return k4.bodyText.slice(0, 80); } })();
  console.log("K4 fallback-user books (must NOT be p1/p3 titles):", k4names);

  dumpResults("probe");
  console.log("\nDONE. Traces in api-traces/.");
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
