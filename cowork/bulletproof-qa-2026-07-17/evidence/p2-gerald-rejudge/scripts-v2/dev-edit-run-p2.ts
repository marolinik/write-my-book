/**
 * D8 leg — start a dev-edit agent session as user_qa_p2 and stream it to completion.
 * Adapted from evidence/p1-maya-rejudge/scripts/dev-edit-run.ts (same protocol so the
 * two personas' traces are comparable). Reads E2E_TEST_SECRET from env; never prints it.
 *
 * Usage: npx tsx --env-file=.env dev-edit-run-p2.ts <bookId> <chapterNumber> <startTrace> <sseRaw> [workflowId]
 */
import { writeFileSync, appendFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p2";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const [bookId, chapterNumberArg, startTrace, sseRaw, workflowArg] = process.argv.slice(2);
const chapterNumber = Number(chapterNumberArg ?? "1");
const workflowId = workflowArg ?? "dev-edit";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

async function main() {
  const startedAt = Date.now();
  const startResp = await fetch(`${BASE}/api/books/${bookId}/agent`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId, chapterNumber }),
  });
  const startText = await startResp.text();
  let startJson: Record<string, unknown> | null = null;
  try { startJson = JSON.parse(startText); } catch { /* */ }
  writeFileSync(startTrace, JSON.stringify({ workflowId, chapterNumber, status: startResp.status, body: startJson ?? startText, capturedAt: new Date().toISOString() }, null, 2));
  console.log(`POST /agent (${workflowId}) -> ${startResp.status} ${JSON.stringify(startJson ?? startText).slice(0, 300)}`);
  if (startResp.status !== 200 || !startJson?.sessionId) { console.error("session did not start"); return; }
  const sessionId = startJson.sessionId as string;

  writeFileSync(sseRaw, "");
  let eventCount = 0, finalStatus: string | null = null, sawDone = false;
  const errors: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900000);
  try {
    const streamResp = await fetch(`${BASE}/api/books/${bookId}/agent/${sessionId}/stream`, { headers: H, signal: controller.signal });
    if (!streamResp.body) { console.error("no stream body"); return; }
    const reader = streamResp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", curData = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data:")) curData += line.slice(5).trim();
        else if (line.trim() === "" && curData) {
          eventCount++;
          let obj: Record<string, unknown> | null = null;
          try { obj = JSON.parse(curData); } catch { obj = { _unparsed: curData }; }
          appendFileSync(sseRaw, JSON.stringify(obj) + "\n");
          if (obj?.type === "error") errors.push(String(obj.content ?? ""));
          if (obj?.final_status) finalStatus = String(obj.final_status);
          if (obj?.type === "done" || obj?.type === "complete" || obj?.status === "complete") sawDone = true;
          curData = "";
        }
      }
    }
  } catch (e) {
    console.error("stream error:", (e as Error).name, (e as Error).message);
    errors.push(`${(e as Error).name}: ${(e as Error).message}`);
  } finally { clearTimeout(timer); }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  appendFileSync(sseRaw, JSON.stringify({ _marker: "STREAM_SUMMARY", sessionId, workflowId, chapterNumber, eventCount, finalStatus, sawDone, errorCount: errors.length, errors: errors.slice(0, 10), elapsed_s: elapsed, capturedAt: new Date().toISOString() }) + "\n");
  console.log(`STREAM DONE session=${sessionId} events=${eventCount} finalStatus=${finalStatus} errors=${errors.length} elapsed=${elapsed}s`);
}
main();
