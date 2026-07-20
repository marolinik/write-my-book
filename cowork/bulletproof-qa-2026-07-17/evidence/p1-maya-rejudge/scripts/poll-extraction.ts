/**
 * Poll continuity extraction to completion for P1 Maya chapter 1.
 * Re-scans (which re-reads graph facts; extraction was already triggered) and reads wiki
 * until entities appear or extraction state leaves "extracting", or ~5 min elapse.
 * Writes final wiki + scan traces. Reads E2E_TEST_SECRET from env; never prints it.
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET!;
const CLERK = "user_qa_p1";
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

const scanTrace = process.argv[2];
const wikiTrace = process.argv[3];

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  let j: any = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, body: j ?? t };
}
async function post(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H });
  const t = await r.text();
  let j: any = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, body: j ?? t };
}

async function main() {
  const MAX = 14;      // ~14 * 25s ≈ 5.8 min
  const INTERVAL = 25000;
  let lastScan: any = null;
  let lastWiki: any = null;
  for (let i = 1; i <= MAX; i++) {
    const wiki = await get(`/api/books/${BOOK}/wiki`);
    lastWiki = wiki;
    const wikiCount = Array.isArray(wiki.body) ? wiki.body.length : "?";
    // re-scan (past 90s throttle window it may re-trigger; reports honest state either way)
    const scan = await post(`/api/books/${BOOK}/continuity/scan?chapterNumber=1`);
    lastScan = scan;
    const st = scan.body?.extraction?.state ?? "?";
    const flags = Array.isArray(scan.body?.flags) ? scan.body.flags.length : "?";
    console.log(`[poll ${i}/${MAX}] wikiEntities=${wikiCount} extractionState=${st} flags=${flags}`);
    if (wikiCount !== 0 && wikiCount !== "?") { console.log("entities present — stopping"); break; }
    if (st !== "extracting" && st !== "pending" && i > 2) { console.log(`extraction settled to '${st}' — one more read then stop`);
      const w2 = await get(`/api/books/${BOOK}/wiki`); lastWiki = w2; break; }
    if (i < MAX) await new Promise((r) => setTimeout(r, INTERVAL));
  }
  if (scanTrace) writeFileSync(scanTrace, JSON.stringify({ ...lastScan, capturedAt: new Date().toISOString() }, null, 2));
  if (wikiTrace) writeFileSync(wikiTrace, JSON.stringify({ ...lastWiki, capturedAt: new Date().toISOString() }, null, 2));
  const wc = Array.isArray(lastWiki.body) ? lastWiki.body.length : "?";
  console.log(`POLL DONE wikiEntities=${wc} finalExtractionState=${lastScan?.body?.extraction?.state}`);
}
main();
