/**
 * Start a dev-edit agent session for P1 Maya (chapter 1) and stream it to completion.
 * Reads E2E_TEST_SECRET from process.env — never printed. Acts as user_qa_p1.
 *
 * Usage: npx tsx --env-file=.env <thisfile> <startTraceFile> <sseRawFile> [chapterNumber]
 *
 * Writes:
 *  - startTraceFile: the POST /agent response (sessionId, queued, jobId)
 *  - sseRawFile: newline-delimited JSON, one object per SSE event, plus a final summary line
 */
import { writeFileSync, appendFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p1";
const BOOK = "4116055c-6183-4675-926a-e04f31126951";

if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const startTrace = process.argv[2] ?? "start.json";
const sseRaw = process.argv[3] ?? "sse-raw.jsonl";
const chapterNumber = Number(process.argv[4] ?? "1");

const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

async function main() {
  // 1. Start the session.
  const startedAt = Date.now();
  const startResp = await fetch(`${BASE}/api/books/${BOOK}/agent`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId: "dev-edit", chapterNumber }),
  });
  const startText = await startResp.text();
  let startJson: any = null;
  try { startJson = JSON.parse(startText); } catch {}
  writeFileSync(startTrace, JSON.stringify({
    status: startResp.status,
    body: startJson ?? startText,
    capturedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`POST /agent -> ${startResp.status} ${JSON.stringify(startJson ?? startText).slice(0, 300)}`);
  if (startResp.status !== 200 || !startJson?.sessionId) {
    console.error("Session did not start; aborting stream.");
    return;
  }
  const sessionId = startJson.sessionId as string;

  // 2. Stream to completion.
  writeFileSync(sseRaw, "");
  let eventCount = 0;
  let finalStatus: string | null = null;
  let sawDone = false;
  const toolEvents: any[] = [];
  const errors: string[] = [];

  const controller = new AbortController();
  const HARD_TIMEOUT_MS = 600000; // 10 min ceiling
  const timer = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS);

  try {
    const streamResp = await fetch(`${BASE}/api/books/${BOOK}/agent/${sessionId}/stream`, {
      method: "GET",
      headers: H,
      signal: controller.signal,
    });
    if (!streamResp.body) { console.error("No stream body"); return; }
    const reader = streamResp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let curData = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data:")) {
          curData += line.slice(5).trim();
        } else if (line.trim() === "") {
          // event boundary
          if (curData) {
            eventCount++;
            let obj: any = null;
            try { obj = JSON.parse(curData); } catch { obj = { _unparsed: curData }; }
            appendFileSync(sseRaw, JSON.stringify(obj) + "\n");
            const t = obj?.type;
            if (t === "tool_use" || t === "tool_result" || t === "tool" || (obj?.content && String(obj.content).includes("CreateFinding"))) {
              toolEvents.push(obj);
            }
            if (t === "error") errors.push(String(obj.content ?? ""));
            if (obj?.final_status) finalStatus = obj.final_status;
            if (obj?.type === "done" || obj?.type === "complete" || obj?.status === "complete") sawDone = true;
            if (obj?.resultMeta || obj?.type === "result") {
              appendFileSync(sseRaw, JSON.stringify({ _marker: "RESULT_META", data: obj }) + "\n");
            }
            curData = "";
          }
        }
      }
      if (sawDone && eventCount > 0) {
        // keep reading a bit; server usually closes right after
      }
    }
  } catch (e) {
    console.error("stream error:", (e as Error).name, (e as Error).message);
    errors.push(`${(e as Error).name}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const summary = {
    _marker: "STREAM_SUMMARY",
    sessionId,
    eventCount,
    finalStatus,
    sawDone,
    toolEventCount: toolEvents.length,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
    elapsed_s: elapsed,
    capturedAt: new Date().toISOString(),
  };
  appendFileSync(sseRaw, JSON.stringify(summary) + "\n");
  console.log(`STREAM DONE sessionId=${sessionId} events=${eventCount} finalStatus=${finalStatus} errors=${errors.length} elapsed=${elapsed}s`);
}

main();
