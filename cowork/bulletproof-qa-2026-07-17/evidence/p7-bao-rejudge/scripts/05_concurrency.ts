import { apiJson, authHeaders, BASE, flushTraces, saveJson, pushTrace } from "./lib";
import { readFileSync } from "fs";
import { join } from "path";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

interface PutResult { idx: number; status: number; body: any; }

async function firePut(bookId: string, chapterId: string, payload: any, idx: number): Promise<PutResult> {
  const res = await fetch(`${BASE}/api/books/${bookId}/chapters/${chapterId}/content`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any = null; try { body = JSON.parse(text); } catch { body = text; }
  return { idx, status: res.status, body };
}

async function main() {
  const state = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "book-state.json"), "utf-8"));
  const bookId: string = state.bookId;
  // Pick chapter 8.
  const chList = await apiJson("get-chapters-for-concurrency", "GET", `/api/books/${bookId}/chapters`);
  const ch = chList.json.find((c: any) => c.chapterNumber === 8);
  const chapterId = ch.id;
  console.log("target chapterId (ch8):", chapterId);

  // Baseline content + version.
  const before = await apiJson("get-ch8-before", "GET", `/api/books/${bookId}/chapters/${chapterId}/content`);
  const baseVersion = before.json.version;
  const baseContent = before.json.markdown;
  console.log("baseVersion", baseVersion, "baseContentLen", baseContent.length);

  const summary: any = { bookId, chapterId, baseVersion };

  // ---------- Scenario A: 5 concurrent STAMPLESS PUTs (D-47 stale-tab repro) ----------
  const stamplessPayloads = Array.from({ length: 5 }, (_, i) => ({
    markdown: `# Ch8 stampless writer ${i}\n\nStamplessDistinct_${i}_Zk08 ${"word ".repeat(50)}variant${i}`,
    changeSource: "user",
  }));
  const aResults = await Promise.all(stamplessPayloads.map((p, i) => firePut(bookId, chapterId, p, i)));
  const a200 = aResults.filter((r) => r.status === 200);
  const a409 = aResults.filter((r) => r.status === 409);
  aResults.forEach((r) => pushTrace({ label: `A-stampless-put-${r.idx}`, method: "PUT",
    url: `/api/books/${bookId}/chapters/${chapterId}/content`, status: r.status, ok: r.status < 400,
    respBody: r.body, note: "no expectedVersion, changeSource=user" }));
  const afterA = await apiJson("get-ch8-after-A", "GET", `/api/books/${bookId}/chapters/${chapterId}/content`);
  summary.scenarioA_stampless = {
    intent: "5 concurrent PUTs w/o expectedVersion should ALL be rejected 409 (no silent last-write-wins)",
    count200: a200.length,
    count409: a409.length,
    statuses: aResults.map((r) => r.status),
    contentUnchangedAfter: afterA.json.markdown === baseContent,
    versionUnchangedAfter: afterA.json.version === baseVersion,
    all409CarryServerState: a409.every((r) => r.body && r.body.error === "version_conflict" && typeof r.body.serverContent === "string"),
    PASS: a200.length === 0 && a409.length === 5 && afterA.json.markdown === baseContent && afterA.json.version === baseVersion,
  };

  // ---------- Scenario B: 5 concurrent STAMPED PUTs at same version (real CAS race) ----------
  const stampVersion = afterA.json.version; // still baseVersion
  const stampedPayloads = Array.from({ length: 5 }, (_, i) => ({
    markdown: `# Ch8 stamped writer ${i}\n\nStampedDistinct_${i}_Zk08Alpha ${"prose ".repeat(80)}endmark${i}_Zk08Omega`,
    changeSource: "user",
    expectedVersion: stampVersion,
  }));
  const bResults = await Promise.all(stampedPayloads.map((p, i) => firePut(bookId, chapterId, p, i)));
  const b200 = bResults.filter((r) => r.status === 200);
  const b409 = bResults.filter((r) => r.status === 409);
  bResults.forEach((r) => pushTrace({ label: `B-stamped-put-${r.idx}`, method: "PUT",
    url: `/api/books/${bookId}/chapters/${chapterId}/content`, status: r.status, ok: r.status < 400,
    respBody: r.body, note: `expectedVersion=${stampVersion}` }));
  const afterB = await apiJson("get-ch8-after-B", "GET", `/api/books/${bookId}/chapters/${chapterId}/content`);

  // Which writer won?
  const winnerIdx = b200.length === 1 ? b200[0].idx : null;
  const expectedWinnerContent = winnerIdx !== null ? stampedPayloads[winnerIdx].markdown : null;
  const savedContent = afterB.json.markdown;
  // Torn check: saved content must equal EXACTLY one submitted payload, no interleaving.
  const matchesExactlyOne = stampedPayloads.filter((p) => p.markdown === savedContent).length === 1;
  const noForeignMarks = stampedPayloads
    .map((p, i) => i)
    .filter((i) => i !== winnerIdx)
    .every((i) => !savedContent.includes(`StampedDistinct_${i}_`));

  summary.scenarioB_stamped = {
    intent: "5 concurrent PUTs stamped at same version => exactly ONE 200, FOUR 409; winner intact (not torn); losers told + recoverable",
    stampVersion,
    count200: b200.length,
    count409: b409.length,
    statuses: bResults.map((r) => r.status),
    winnerIdx,
    savedVersion: afterB.json.version,
    savedEqualsWinnerPayload: expectedWinnerContent !== null && savedContent === expectedWinnerContent,
    savedMatchesExactlyOnePayload: matchesExactlyOne,
    noInterleavingFromLosers: noForeignMarks,
    all409CarryRecoverableServerState: b409.every((r) => r.body && r.body.error === "version_conflict" && typeof r.body.serverContent === "string" && typeof r.body.currentVersion === "number"),
    PASS: b200.length === 1 && b409.length === 4 && matchesExactlyOne && noForeignMarks && afterB.json.version === stampVersion + 1,
  };

  saveJson("concurrency-d47.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  flushTraces("05-concurrency-d47.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
