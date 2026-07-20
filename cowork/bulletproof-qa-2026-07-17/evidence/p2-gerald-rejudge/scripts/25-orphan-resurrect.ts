/**
 * P2 RE-JUDGE — orphan-document resurrection probe.
 *
 * DELETE /chapters/:id removes the chapter row but NOT the CHAPTER_CONTENT
 * document (keyed by book_id + chapter_number). Does a NEW chapter created with
 * the SAME chapterNumber inherit the deleted chapter's prose?
 *
 *   1. Fresh book. Create ch#2, save distinctive "GHOST" content.
 *   2. Delete ch#2 (chapter row gone; content doc orphaned).
 *   3. Create a NEW chapter with chapterNumber=2, fresh title.
 *   4. GET its content: empty (clean) OR the GHOST prose (resurrection defect)?
 *      Also: does the new chapter's FIRST save behave as create or hit the
 *      stale orphan (409 / convergence)?
 */
import pg from "pg";
import { call, line } from "./_client";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const log = (s: string) => console.log(s);
  try {
    log(`=== ORPHAN RESURRECTION PROBE @ ${new Date().toISOString()} ===\n`);
    const created = await call("POST", "/api/books", { body: { name: `P2-REJUDGE-ORPHAN-${Date.now()}`, genre: "thriller" } });
    const bookId = (created.body as { id: string }).id;
    log(`book=${bookId}`);

    const mk = await call("POST", `/api/books/${bookId}/chapters`, { body: { actNumber: 1, chapterNumber: 2, title: "Original ch2" } });
    const chOld = (mk.body as {id:string}).id;
    const GHOST = "# Original ch2\n\nGHOST_SECRET_9f3a — this prose belonged to the DELETED chapter and must not resurface.";
    const s = await call("PUT", `/api/books/${bookId}/chapters/${chOld}/content`, { body: { markdown: GHOST } });
    log(`saved GHOST to old ch2 (${chOld}): [${s.status}] v=${(s.body as {version?:number}).version}`);

    const del = await call("DELETE", `/api/books/${bookId}/chapters/${chOld}`);
    log(`deleted old ch2: [${del.status}]`);

    const orphan = await pool.query(
      `select id, current_version from documents where book_id=$1 and type='CHAPTER_CONTENT' and chapter_number=2`, [bookId]);
    log(`orphan content docs for chapter_number=2 after delete: ${orphan.rows.length} (${JSON.stringify(orphan.rows)})\n`);

    const mk2 = await call("POST", `/api/books/${bookId}/chapters`, { body: { actNumber: 1, chapterNumber: 2, title: "Brand-new ch2 (reused number)" } });
    const chNew = (mk2.body as {id?:string}).id;
    log(`created NEW ch2 (reused chapterNumber=2) id=${chNew} [${mk2.status}]`);

    const g = await call("GET", `/api/books/${bookId}/chapters/${chNew}/content`, { label: "get-new-ch2" });
    log(`GET new ch2 content: ${line(g)}`);
    const md = (g.body as {markdown?:string}).markdown ?? "";
    const resurrected = md.includes("GHOST_SECRET_9f3a");
    log(`\n>>> RESURRECTION: new same-numbered chapter returns deleted prose: ${resurrected ? "YES — DEFECT (deleted content resurfaces on a fresh chapter)" : "NO (clean/empty)"}`);
    log(`    new ch2 markdown length=${md.length}, documentId=${(g.body as {documentId?:string}).documentId ?? "<none>"}, version=${(g.body as {version?:number}).version ?? "-"}`);

    // What does the new chapter's first save do?
    const firstSave = await call("PUT", `/api/books/${bookId}/chapters/${chNew}/content`, { body: { markdown: "# Brand-new ch2\n\nfresh writing, no expectedVersion." }, label: "new-ch2-first-save" });
    log(`\nnew ch2 first save (no expectedVersion): ${line(firstSave)}`);
    log(`    status=${firstSave.status} — 200 create=clean; 409=collided with orphan (writer blocked on ghost row)`);
  } finally {
    await pool.end();
  }
}
main().catch((e)=>{console.error("ORPHAN ERROR",e);process.exit(1);});
