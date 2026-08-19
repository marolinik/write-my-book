/**
 * Reusable HTTP driver for P1 Maya rejudge evidence capture.
 * Reads E2E_TEST_SECRET from process.env — NEVER printed or written to disk.
 * Acts as persona user_qa_p1 (Indie plan, BYOK OpenRouter qwen3.6-27b).
 *
 * Usage:
 *   npx tsx --env-file=.env <thisfile> <METHOD> <PATH> [--body '<json>'] [--raw '<rawbody>']
 *          [--trace <file>] [--timeout <ms>] [--ct <content-type>]
 *
 * Writes a JSON trace {request(masked), status, headers, body, elapsed_ms} to --trace file (and stdout summary).
 * Secrets are referenced by env var only; the trace records header NAMES with masked values.
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p1";

if (!SECRET) {
  console.error("FATAL: E2E_TEST_SECRET not present in process.env");
  process.exit(1);
}

const argv = process.argv.slice(2);
const method = (argv[0] ?? "GET").toUpperCase();
const path = argv[1] ?? "/api/health";

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const bodyJson = flag("--body");
const rawBody = flag("--raw");
const traceFile = flag("--trace");
const timeoutMs = Number(flag("--timeout") ?? "120000");
const contentType = flag("--ct") ?? "application/json";

const url = path.startsWith("http") ? path : `${BASE}${path}`;

const headers: Record<string, string> = {
  "x-e2e-test-secret": SECRET,
  "x-e2e-clerk-id": CLERK_ID,
};
let bodyToSend: string | undefined;
if (rawBody !== undefined) {
  bodyToSend = rawBody;
  headers["Content-Type"] = contentType;
} else if (bodyJson !== undefined) {
  bodyToSend = bodyJson;
  headers["Content-Type"] = contentType;
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const started = Date.now();

(async () => {
  let status = 0;
  let respHeaders: Record<string, string> = {};
  let bodyText = "";
  let parsed: unknown = null;
  let errorNote: string | null = null;
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: bodyToSend,
      signal: controller.signal,
    });
    status = resp.status;
    resp.headers.forEach((v, k) => (respHeaders[k] = v));
    bodyText = await resp.text();
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
  } catch (e) {
    errorNote = `${(e as Error).name}: ${(e as Error).message}`;
  } finally {
    clearTimeout(timer);
  }
  const elapsed_ms = Date.now() - started;

  const trace = {
    request: {
      method,
      url,
      headers: {
        "x-e2e-test-secret": "<E2E_TEST_SECRET redacted>",
        "x-e2e-clerk-id": CLERK_ID,
        ...(headers["Content-Type"] ? { "Content-Type": headers["Content-Type"] } : {}),
      },
      body: bodyToSend ?? null,
    },
    status,
    error: errorNote,
    responseHeaders: respHeaders,
    body: parsed ?? bodyText,
    bodyIsRawText: parsed === null && bodyText.length > 0,
    elapsed_ms,
    capturedAt: new Date().toISOString(),
  };

  const out = JSON.stringify(trace, null, 2);
  if (traceFile) {
    writeFileSync(traceFile, out);
  }
  // Console summary only (no secret).
  console.log(`${method} ${path} -> ${status}${errorNote ? " ERR:" + errorNote : ""} (${elapsed_ms}ms)${traceFile ? " trace:" + traceFile : ""}`);
  const bodyPreview = typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed).slice(0, 600) : bodyText.slice(0, 600);
  console.log("body-preview:", bodyPreview);
})();
