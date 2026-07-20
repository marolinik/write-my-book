// Shared HTTP client for P6-Owen REJUDGE evidence capture.
// Reads secrets from process.env ONLY (run: npx tsx --env-file=.env <script>).
// Never prints raw secret values.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const BASE = "http://localhost:3002";
export const BOOK_ID = "6d69fd7c-f7a4-4e3d-bf49-1415d81f5326";
export const CLERK_ID = "user_qa_p6";
export const CHAPTERS: Record<string, string> = {
  "1": "e279d436-37ec-407b-85fe-e0520f9e679a",
  "2": "50ed60e2-f136-4a33-825c-1956c1dd6ee3",
  "3": "97c93130-743e-4cfa-adcc-e64a1311f9ee",
  "4": "677f38b3-c188-47bd-8a34-1491dfce2c7e",
  "5": "42a58de8-146d-43de-9797-7b236038a355",
};

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) {
  throw new Error("E2E_TEST_SECRET missing from process.env — run with --env-file=.env");
}

export function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-e2e-test-secret": SECRET as string,
    "x-e2e-clerk-id": CLERK_ID,
    "content-type": "application/json",
    ...extra,
  };
}

export const TRACE_DIR = join(
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p6-owen-rejudge",
  "api-traces"
);
export const TRANSCRIPT_DIR = join(
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p6-owen-rejudge",
  "transcripts"
);

export function saveTrace(name: string, data: unknown): void {
  writeFileSync(join(TRACE_DIR, name), JSON.stringify(data, null, 1), "utf8");
}
export function saveTranscript(name: string, data: unknown): void {
  writeFileSync(join(TRANSCRIPT_DIR, name), JSON.stringify(data, null, 1), "utf8");
}

export interface ApiResult {
  status: number;
  elapsed: number;
  body: unknown;
}

export async function api(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<ApiResult> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const elapsed = (Date.now() - t0) / 1000;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON (e.g. framework HTML 404). Keep first 300 chars only.
    parsed = { __nonjson__: true, snippet: text.slice(0, 300), length: text.length };
  }
  return { status: res.status, elapsed, body: parsed };
}

/** Stream an SSE endpoint, collecting parsed events until [DONE] or stream end. */
export async function streamSSE(
  path: string,
  onEvent?: (ev: Record<string, unknown>, raw: string) => void,
  maxMs = 600000
): Promise<{ events: Array<{ t: number; ev: Record<string, unknown> }>; nEvents: number; final: Record<string, unknown> | null; elapsed: number }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  const events: Array<{ t: number; ev: Record<string, unknown> }> = [];
  let final: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      headers: headers({ accept: "text/event-stream" }),
      signal: controller.signal,
    });
    if (!res.body) throw new Error("no stream body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const json = dataLine.slice(5).trim();
        if (json === "[DONE]") continue;
        try {
          const ev = JSON.parse(json) as Record<string, unknown>;
          const t = (Date.now() - t0) / 1000;
          events.push({ t, ev });
          if (onEvent) onEvent(ev, chunk);
          if (ev.type === "complete" || ev.type === "done") final = ev;
        } catch {
          // ignore keepalive / partials
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return { events, nEvents: events.length, final, elapsed: (Date.now() - t0) / 1000 };
}
