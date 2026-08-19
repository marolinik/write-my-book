/**
 * P2 RE-JUDGE — adversarial data-integrity probes on CURRENT committed code.
 *
 *  A. D-01 malformed JSON body -> 400 envelope (content PUT + 2 corroborating routes)
 *  B. Oversized / boundary body: 2,000,000 chars -> 200 ; 2,000,001 -> 400 Zod
 *  C. Concurrent CAS storm on EXISTING doc (same expectedVersion) -> exactly ONE
 *     200, rest 409 (no silent lost-update under concurrency)
 *  D. Concurrent STAMPLESS storm on existing doc (D-47) -> all 409 (no LWW)
 *  E. Autosave rapid-fire: 20 sequential stamped PUTs -> monotone +1 version chain,
 *     content echoes each time
 *  F. Delete-chapter-then-save -> clean 404 (no 500, no orphan write); observe
 *     whether the CHAPTER_CONTENT document row is orphaned by chapter delete
 *  G. Delete/save race: concurrent DELETE + PUT
 */
import pg from "pg";
import { call, line } from "./_client";

async function docRows(pool: pg.Pool, bookId: string, ch: number) {
  const r = await pool.query(
    `select id, current_version, storage_key from documents
      where book_id=$1 and type='CHAPTER_CONTENT' and chapter_number=$2 order by created_at asc`,
    [bookId, ch]
  );
  return r.rows;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const out: string[] = [];
  const log = (s: string) => { out.push(s); console.log(s); };
  try {
    log(`=== ADVERSARIAL PROBES @ ${new Date().toISOString()} (user_qa_p2) ===\n`);

    const created = await call("POST", "/api/books", { body: { name: `P2-REJUDGE-ADV-${Date.now()}`, genre: "thriller" } });
    const bookId = (created.body as { id: string }).id;
    const ch1 = (created.body as { firstChapterId: string }).firstChapterId;
    log(`book=${bookId} ch1=${ch1}\n`);
    const cPath = `/api/books/${bookId}/chapters/${ch1}/content`;

    // ---------- A. D-01 malformed JSON ----------
    log(`--- A. D-01 malformed JSON body ---`);
    const badContent = await call("PUT", cPath, { rawBody: "{not valid json!!", label: "malformed-content-PUT" });
    log("content PUT malformed: " + line(badContent));
    const badBook = await call("POST", "/api/books", { rawBody: "{oops:::", label: "malformed-book-POST" });
    log("book POST malformed:   " + line(badBook));
    const badModel = await call("PATCH", "/api/settings/default-model", { rawBody: "@@@not json", label: "malformed-default-model-PATCH" });
    log("default-model PATCH malformed: " + line(badModel));
    const d01Pass = badContent.status === 400 && badBook.status === 400 && badModel.status === 400;
    log(`>>> D-01 malformed->400 (3 routes): ${d01Pass ? "PASS" : "FAIL"}`);
    const leak = JSON.stringify([badContent.body, badBook.body, badModel.body]).match(/at Object|SyntaxError|\/src\/|node_modules|position \d+/i);
    log(`>>> no stack/parser leak in envelope: ${leak ? "FAIL leak=" + leak[0] : "PASS"}\n`);

    // ---------- B. Oversized / boundary body ----------
    log(`--- B. Body-size boundary (schema max 2,000,000) ---`);
    const atMax = "x".repeat(2_000_000);
    const overMax = "x".repeat(2_000_001);
    const rMax = await call("PUT", cPath, { body: { markdown: atMax }, label: "at-2M" });
    log(`at 2,000,000 chars: [${rMax.status}] ${typeof rMax.body === "object" ? JSON.stringify(rMax.body) : String(rMax.body).slice(0,120)}`);
    const rOver = await call("PUT", cPath, { body: { markdown: overMax }, label: "over-2M" });
    log(`at 2,000,001 chars: [${rOver.status}] ${typeof rOver.body === "object" ? JSON.stringify(rOver.body) : String(rOver.body).slice(0,120)}`);
    log(`>>> boundary: at-max=${rMax.status}(expect 200) over-max=${rOver.status}(expect 400): ${rMax.status===200 && rOver.status===400 ? "PASS" : "PARTIAL/FAIL"}\n`);

    // reset content to a small known body via CAS
    let g = await call("GET", cPath); let v = (g.body as {version?:number}).version ?? 0;
    await call("PUT", cPath, { body: { markdown: "# reset\n\nbaseline body.", expectedVersion: v } });

    // ---------- C. Concurrent CAS storm on existing doc ----------
    log(`--- C. Concurrent CAS storm (10 PUTs, same expectedVersion) ---`);
    g = await call("GET", cPath); v = (g.body as {version?:number}).version ?? 0;
    log(`loaded version=${v}; firing 10 concurrent stamped PUTs all expectedVersion=${v}`);
    const M = 10;
    const stormBodies = Array.from({length:M},(_,i)=>`# CAS storm ${i}\n\nstorm body ${i} token=STORM_${i}_${Math.random().toString(36).slice(2,8)}.`);
    const storm = await Promise.all(stormBodies.map((markdown,i)=>call("PUT",cPath,{body:{markdown,expectedVersion:v},label:`storm-${i}`})));
    const st = storm.map(r=>r.status);
    const won = st.filter(s=>s===200).length, lost = st.filter(s=>s===409).length, err = st.filter(s=>![200,409].includes(s)).length;
    log(`storm statuses: ${JSON.stringify(st)}`);
    log(`  200s=${won} 409s=${lost} other=${err}`);
    const rowsC = await docRows(pool, bookId, 1);
    const gAfter = await call("GET", cPath); const finalV = (gAfter.body as {version?:number}).version;
    const survivor = (gAfter.body as {markdown?:string}).markdown ?? "";
    const survivorIsAWinner = stormBodies.includes(survivor);
    log(`  doc version now=${rowsC[0]?.current_version} (was ${v}, expect ${v+1} => exactly one winner)`);
    log(`  surviving body is one of the storm bodies: ${survivorIsAWinner}`);
    log(`>>> CAS storm: exactly-one-winner=${won===1?"PASS":"FAIL("+won+")"} no-errors=${err===0?"PASS":"FAIL"} version-advanced-by-1=${rowsC[0]?.current_version===v+1?"PASS":"FAIL"} rowcount=${rowsC.length===1?"PASS":"FAIL"}\n`);

    // ---------- D. Concurrent stampless storm (D-47) ----------
    log(`--- D. Concurrent STAMPLESS storm (8 PUTs, no expectedVersion, source=user) ---`);
    const D = 8;
    const spless = await Promise.all(Array.from({length:D},(_,i)=>call("PUT",cPath,{body:{markdown:`# stampless ${i}`},label:`stampless-${i}`})));
    const sp = spless.map(r=>r.status);
    log(`  statuses: ${JSON.stringify(sp)}`);
    const allRejected = sp.every(s=>s===409);
    const rowsD = await docRows(pool, bookId, 1);
    log(`>>> stampless storm all-409 (no silent LWW): ${allRejected?"PASS":"FAIL"} ; version unchanged=${rowsD[0]?.current_version} (expect ${finalV}): ${rowsD[0]?.current_version===finalV?"PASS":"FAIL"}\n`);

    // ---------- E. Autosave rapid-fire ----------
    log(`--- E. Autosave rapid-fire: 20 sequential stamped PUTs ---`);
    let ok = 0; let cur = (await call("GET", cPath)).body as {version?:number}; let curV = cur.version ?? 0;
    let brokenChain = false;
    for (let i=0;i<20;i++){
      const md = `# autosave ${i}\n\nrapid write ${i} nonce=AF_${i}_${Math.random().toString(36).slice(2,10)}.`;
      const put = await call("PUT", cPath, { body: { markdown: md, expectedVersion: curV }, label: `autosave-${i}` });
      const newV = (put.body as {version?:number}).version;
      const g2 = await call("GET", cPath);
      const echo = ((g2.body as {markdown?:string}).markdown ?? "") === md;
      const monotone = newV === curV + 1;
      if (put.status===200 && echo && monotone) ok++; else brokenChain = true;
      if (i<3 || !monotone || !echo) log(`  put ${i}: [${put.status}] v ${curV}->${newV} monotone=${monotone} echo=${echo}${monotone&&echo?"":"  <-- ANOMALY"}`);
      curV = newV ?? curV;
    }
    log(`>>> autosave rapid-fire: ${ok}/20 clean, monotone chain unbroken=${!brokenChain?"PASS":"FAIL"}, final version=${curV}\n`);

    // ---------- F. Delete-chapter-then-save ----------
    log(`--- F. Delete-chapter-then-save ---`);
    const mkCh2 = await call("POST", `/api/books/${bookId}/chapters`, { body: { actNumber: 1, chapterNumber: 2, title: "Doomed chapter" }, label: "create-ch2" });
    const ch2 = (mkCh2.body as {id?:string}).id;
    log(`created ch2=${ch2} [${mkCh2.status}]`);
    const c2Path = `/api/books/${bookId}/chapters/${ch2}/content`;
    const save2 = await call("PUT", c2Path, { body: { markdown: "# Doomed\n\nsoon to be deleted." }, label: "save-ch2" });
    log(`save ch2: ${line(save2)}`);
    const ch2docsBefore = await docRows(pool, bookId, 2);
    log(`ch2 content docs before delete: ${ch2docsBefore.length}`);
    const del = await call("DELETE", `/api/books/${bookId}/chapters/${ch2}`, { label: "delete-ch2" });
    log(`delete ch2: ${line(del)}`);
    const saveAfterDelete = await call("PUT", c2Path, { body: { markdown: "# ghost write after delete" }, label: "save-after-delete" });
    log(`PUT to deleted chapter: ${line(saveAfterDelete)}`);
    const ch2docsAfter = await docRows(pool, bookId, 2);
    log(`>>> save-after-delete status=${saveAfterDelete.status} (expect 404, NOT 500): ${saveAfterDelete.status===404?"PASS":"FAIL"}`);
    log(`>>> orphan CHAPTER_CONTENT rows for deleted ch2: ${ch2docsAfter.length} (delete does NOT cascade the content doc — hygiene observation, ${ch2docsAfter.length>0?"ORPHAN PRESENT":"none"})\n`);

    // ---------- G. Delete/save race ----------
    log(`--- G. Delete/save race (concurrent DELETE + PUT on a fresh ch3) ---`);
    const mkCh3 = await call("POST", `/api/books/${bookId}/chapters`, { body: { actNumber: 1, chapterNumber: 3, title: "Race chapter" }, label: "create-ch3" });
    const ch3 = (mkCh3.body as {id?:string}).id;
    const c3Path = `/api/books/${bookId}/chapters/${ch3}/content`;
    await call("PUT", c3Path, { body: { markdown: "# ch3 baseline" } });
    const [raceDel, racePut] = await Promise.all([
      call("DELETE", `/api/books/${bookId}/chapters/${ch3}`, { label: "race-delete" }),
      call("PUT", c3Path, { body: { markdown: "# ch3 concurrent save during delete" }, expectedVersion: undefined, label: "race-save" } as never),
    ]);
    log(`race DELETE: ${line(raceDel)}`);
    log(`race PUT:    ${line(racePut)}`);
    const raceClean = [200,404,409].includes(racePut.status) && [200,404].includes(raceDel.status);
    log(`>>> delete/save race resolves cleanly (no 500): DELETE=${raceDel.status} PUT=${racePut.status}: ${raceClean && racePut.status!==500 && raceDel.status!==500?"PASS":"FAIL"}\n`);

    log(`=== ADVERSARIAL SUMMARY ===`);
    log(`A D-01 malformed->400: ${d01Pass?"PASS":"FAIL"}`);
    log(`B body boundary: at-max ${rMax.status}, over-max ${rOver.status}`);
    log(`C CAS storm exactly-one-winner: ${won===1?"PASS":"FAIL("+won+")"} errors=${err}`);
    log(`D stampless storm all-409: ${allRejected?"PASS":"FAIL"}`);
    log(`E autosave rapid-fire: ${ok}/20 monotone`);
    log(`F delete-then-save 404: ${saveAfterDelete.status===404?"PASS":"FAIL"} orphan-content-rows=${ch2docsAfter.length}`);
    log(`G delete/save race no-500: ${racePut.status!==500 && raceDel.status!==500?"PASS":"FAIL"}`);
    log(`BOOK_ID=${bookId}`);
  } finally {
    await pool.end();
  }
}
main().catch((e)=>{console.error("ADV ERROR",e);process.exit(1);});
