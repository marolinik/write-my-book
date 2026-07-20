/**
 * P2 RE-JUDGE — chapter DELETE latency repro. Probe F saw 10,002ms; probe G saw
 * 96ms. Measure DELETE wall-clock across several chapters (with saved content, so
 * the fire-and-forget vector-delete path is exercised) to classify: one-off cold
 * path vs intermittent ~10s stall.
 */
import { call } from "./_client";

async function main() {
  const log = (s: string) => console.log(s);
  log(`=== chapter DELETE latency @ ${new Date().toISOString()} ===\n`);
  const book = await call("POST", "/api/books", { body: { name: `P2-REJUDGE-DELLAT-${Date.now()}`, genre: "thriller" } });
  const bookId = (book.body as {id?:string}).id;

  const times: number[] = [];
  for (let i = 2; i <= 8; i++) {
    const mk = await call("POST", `/api/books/${bookId}/chapters`, { body: { actNumber: 1, chapterNumber: i, title: `Ch ${i}` } });
    const chId = (mk.body as {id?:string}).id;
    await call("PUT", `/api/books/${bookId}/chapters/${chId}/content`, { body: { markdown: `# Ch ${i}\n\nsome prose to index nonce=${Math.random()}.` } });
    const del = await call("DELETE", `/api/books/${bookId}/chapters/${chId}`, { label: `del-${i}` });
    times.push(del.ms);
    log(`  delete ch${i}: [${del.status}] ${del.ms}ms`);
  }
  const max = Math.max(...times), min = Math.min(...times);
  const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
  const slow = times.filter(t=>t>3000).length;
  log(`\nDELETE latency: min=${min}ms max=${max}ms avg=${avg}ms ; >3s occurrences=${slow}/${times.length}`);
  log(`classification: ${slow===0 ? "one-off cold path (probe-F 10s NOT reproduced here)" : slow<times.length ? "INTERMITTENT ~multi-second stall (real, non-deterministic)" : "consistently slow"}`);
}
main().catch((e)=>{console.error("DELLAT ERROR",e);process.exit(1);});
