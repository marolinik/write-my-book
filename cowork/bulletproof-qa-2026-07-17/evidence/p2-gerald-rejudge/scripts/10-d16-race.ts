/**
 * P2 RE-JUDGE — D-16 LIVE re-test on CURRENT committed code.
 *
 *  1. Fresh book (auto-empty ch1, no CHAPTER_CONTENT doc yet).
 *  2. Fire N concurrent FIRST-save PUTs, different bodies, NO expectedVersion.
 *     -> Expect EXACTLY ONE documents row for (book,CHAPTER_CONTENT,ch1).
 *     -> Expect surviving content == one of the raced bodies (no torn/blank row).
 *  3. Read-your-writes: 10 PUT(expectedVersion)->GET cycles; GET must echo the
 *     just-written body and keep the SAME documentId (deterministic resolution).
 *  4. Two-tab CAS: stale expectedVersion -> 409 + server content (no silent
 *     overwrite); stampless interactive overwrite (D-47) -> 409.
 *  5. Row-count re-assert after all of it: still exactly one row.
 */
import pg from "pg";
import { call, line } from "./_client";

const CH = 1;

async function docRows(pool: pg.Pool, bookId: string) {
  const r = await pool.query(
    `select id, current_version, storage_key, created_at
       from documents
      where book_id = $1 and type = 'CHAPTER_CONTENT' and chapter_number = $2
      order by created_at asc`,
    [bookId, CH]
  );
  return r.rows;
}
async function versionCount(pool: pg.Pool, docId: string) {
  const r = await pool.query(
    `select count(*)::int n, max(version)::int maxv from document_versions where document_id = $1`,
    [docId]
  );
  return r.rows[0];
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const out: string[] = [];
  const log = (s: string) => { out.push(s); console.log(s); };
  try {
    log(`=== D-16 RE-TEST @ ${new Date().toISOString()} (persona user_qa_p2) ===\n`);

    // 1. Fresh book
    const bookName = `P2-REJUDGE-D16-${Date.now()}`;
    const created = await call("POST", "/api/books", {
      body: { name: bookName, genre: "thriller" }, label: "create-book",
    });
    log("CREATE BOOK: " + line(created));
    const bookId = (created.body as { id: string }).id;
    const firstChapterId = (created.body as { firstChapterId: string }).firstChapterId;
    log(`bookId=${bookId} firstChapterId=${firstChapterId}\n`);

    const contentPath = `/api/books/${bookId}/chapters/${firstChapterId}/content`;

    // Pre-race: assert zero content docs
    const pre = await docRows(pool, bookId);
    log(`PRE-RACE doc rows for (book,CHAPTER_CONTENT,ch1): ${pre.length} (expect 0)\n`);

    // 2. Race N concurrent first-saves, distinct bodies, NO expectedVersion.
    const N = 6;
    const bodies = Array.from({ length: N }, (_, i) =>
      `# Racing writer ${i}\n\nBody from concurrent first-save #${i}. Marker=RACE_${i}_${Math.random().toString(36).slice(2, 8)}.`
    );
    log(`--- Firing ${N} CONCURRENT first-save PUTs (no expectedVersion) ---`);
    const raced = await Promise.all(
      bodies.map((markdown, i) =>
        call("PUT", contentPath, { body: { markdown }, label: `race-${i}` })
      )
    );
    for (const r of raced) log("  " + line(r));
    const statuses = raced.map((r) => r.status);
    log(`race statuses: ${JSON.stringify(statuses)}`);
    log(`  200s=${statuses.filter((s) => s === 200).length} 409s=${statuses.filter((s) => s === 409).length} 500s=${statuses.filter((s) => s === 500).length} other=${statuses.filter((s) => ![200,409,500].includes(s)).length}\n`);

    // 3. Row count MUST be exactly one
    const postRace = await docRows(pool, bookId);
    log(`POST-RACE doc rows: ${postRace.length} (EXPECT EXACTLY 1)`);
    for (const row of postRace) log(`  row id=${row.id} v=${row.current_version} key=${row.storage_key} created=${row.created_at.toISOString()}`);
    const rowOk = postRace.length === 1;
    log(`  >>> ROW-COUNT INVARIANT: ${rowOk ? "PASS (1 row)" : "FAIL (" + postRace.length + " rows)"}\n`);

    // Surviving content must be one of the raced bodies (not blank / not torn)
    const getAfter = await call("GET", contentPath, { label: "get-after-race" });
    log("GET after race: " + line(getAfter));
    const survivedMd = (getAfter.body as { markdown?: string }).markdown ?? "";
    const survivedDocId = (getAfter.body as { documentId?: string }).documentId;
    const matchIdx = bodies.findIndex((b) => b === survivedMd);
    log(`  survived body matches raced body index: ${matchIdx} (>=0 means an intact raced body won; -1 = torn/foreign content)`);
    log(`  survived documentId=${survivedDocId} (== ${postRace[0]?.id}? ${survivedDocId === postRace[0]?.id})\n`);
    if (survivedDocId) {
      const vc = await versionCount(pool, survivedDocId);
      log(`  version rows on surviving doc: count=${vc.n} maxVersion=${vc.maxv}\n`);
    }

    // 4. Read-your-writes across 10 cycles (CAS-stamped) — deterministic resolution.
    log(`--- Read-your-writes: 10 PUT(expectedVersion)->GET cycles ---`);
    let ryowPass = 0;
    let stableDocId = survivedDocId;
    for (let i = 0; i < 10; i++) {
      const g0 = await call("GET", contentPath, { label: `ryow-get-${i}` });
      const ver = (g0.body as { version?: number }).version ?? 0;
      const did0 = (g0.body as { documentId?: string }).documentId;
      const md = `# RYOW cycle ${i}\n\nUnique write ${i} token=RYOW_${i}_${Math.random().toString(36).slice(2, 10)}.`;
      const put = await call("PUT", contentPath, { body: { markdown: md, expectedVersion: ver }, label: `ryow-put-${i}` });
      const g1 = await call("GET", contentPath, { label: `ryow-verify-${i}` });
      const back = (g1.body as { markdown?: string }).markdown ?? "";
      const did1 = (g1.body as { documentId?: string }).documentId;
      const echoOk = back === md;
      const idStable = did0 === stableDocId && did1 === stableDocId;
      if (echoOk && idStable && put.status === 200) ryowPass++;
      log(`  cycle ${i}: PUT[${put.status}] expectedV=${ver}->v=${(put.body as {version?:number}).version} echo=${echoOk} docId-stable=${idStable}${echoOk&&idStable?"":"  <-- ANOMALY"}`);
    }
    log(`  >>> READ-YOUR-WRITES: ${ryowPass}/10 cycles stable\n`);

    // 5. Two-tab CAS: two tabs loaded at same version.
    log(`--- Two-tab CAS drill ---`);
    const load = await call("GET", contentPath, { label: "cas-load" });
    const baseV = (load.body as { version?: number }).version ?? 0;
    log(`  both tabs load at version=${baseV}`);
    const tabA = await call("PUT", contentPath, { body: { markdown: `# Tab A wins\n\nTab A content at v${baseV}.`, expectedVersion: baseV }, label: "cas-tabA" });
    log("  TAB A (fresh version): " + line(tabA));
    const tabB = await call("PUT", contentPath, { body: { markdown: `# Tab B stale\n\nTab B stale write at v${baseV}.`, expectedVersion: baseV }, label: "cas-tabB-stale" });
    log("  TAB B (STALE version): " + line(tabB));
    const casOk = tabA.status === 200 && tabB.status === 409;
    const serverContent = (tabB.body as { serverContent?: string }).serverContent ?? "";
    const noSilentOverwrite = serverContent.includes("Tab A wins");
    log(`  >>> CAS 409 on stale tab: ${casOk ? "PASS" : "FAIL"} ; 409 body carries winner's content (no silent overwrite): ${noSilentOverwrite ? "PASS" : "FAIL"}`);

    // stampless interactive overwrite (D-47)
    const stampless = await call("PUT", contentPath, { body: { markdown: `# stampless overwrite attempt` }, label: "cas-stampless" });
    log("  STAMPLESS interactive overwrite (no expectedVersion, source=user): " + line(stampless));
    log(`  >>> D-47 stampless overwrite rejected 409: ${stampless.status === 409 ? "PASS" : "FAIL (" + stampless.status + ")"}\n`);

    // 6. Final row-count re-assert
    const finalRows = await docRows(pool, bookId);
    log(`FINAL doc rows: ${finalRows.length} (EXPECT still exactly 1) -> ${finalRows.length === 1 ? "PASS" : "FAIL"}`);

    log(`\n=== D-16 SUMMARY ===`);
    log(`row-count-after-race: ${rowOk ? "1 (PASS)" : postRace.length + " (FAIL)"}`);
    log(`survived-body-intact: ${matchIdx >= 0 ? "PASS" : "FAIL"}`);
    log(`read-your-writes: ${ryowPass}/10`);
    log(`two-tab-CAS-409: ${casOk ? "PASS" : "FAIL"}  no-silent-overwrite: ${noSilentOverwrite ? "PASS" : "FAIL"}`);
    log(`stampless-overwrite-409: ${stampless.status === 409 ? "PASS" : "FAIL"}`);
    log(`final-row-count: ${finalRows.length === 1 ? "PASS" : "FAIL"}`);
    log(`BOOK_ID=${bookId} CHAPTER_ID=${firstChapterId}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error("D16 ERROR", e); process.exit(1); });
