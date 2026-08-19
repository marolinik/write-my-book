/**
 * Poll an EXISTING batch (by id) until it reaches a terminal status, appending
 * to its jsonl and recording the last 3 polls + the digest-reconciled row from
 * BOTH the detail route and the list route (acceptance (e): terminal poll ==
 * digest-reconciled row). No enqueue — reuse for run1 which outran its window.
 *
 * Usage: tsx 03-poll-to-terminal.ts <bookId> <batchId> <run-label> [maxSeconds]
 */
import { api, nowIso, sleep } from "./_helper";
import { appendFileSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");
const bookId = process.argv[2];
const batchId = process.argv[3];
const runLabel = process.argv[4] ?? "run1";
const maxSeconds = Number(process.argv[5] ?? "420");
const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);

async function main() {
  const jsonlPath = join(OUT, "poll-timelines", `${runLabel}.jsonl`);
  const t0 = Date.now();
  const recent: unknown[] = [];
  let terminalBody: unknown = null;
  let n = 0;

  while ((Date.now() - t0) / 1000 < maxSeconds) {
    const p = await api<{ batch: { status: string } }>(
      "GET",
      `/api/books/${bookId}/batch/${batchId}`
    );
    n++;
    const ts = nowIso();
    const rec = { event: "poll-terminal", n, ts, latencyMs: p.latencyMs, status: p.status, ...(p.body as object) };
    appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    recent.push(rec);
    if (recent.length > 3) recent.shift();
    const st = (p.body as { batch?: { status?: string } })?.batch?.status;
    if (st && TERMINAL.has(st)) {
      terminalBody = p.body;
      break;
    }
    await sleep(1500);
  }

  // Digest-reconciled row from the list route (raw stored BatchRun) + detail
  const listRow = await api<{ batches: { id: string }[] }>(
    "GET",
    `/api/books/${bookId}/batch`
  );
  const listMatch = (listRow.body as { batches?: { id: string }[] })?.batches?.find(
    (b) => b.id === batchId
  );

  const out = {
    runLabel,
    batchId,
    reachedTerminal: terminalBody != null,
    last3Polls: recent,
    terminalDetailRoute: terminalBody,
    digestReconciledListRow: listMatch,
  };
  writeFileSync(
    join(OUT, "poll-timelines", `${runLabel}-terminal.json`),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("TERMINAL POLL ERROR", e);
  process.exit(1);
});
