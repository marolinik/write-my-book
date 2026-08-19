// P8 Rita rejudge — shared HTTP driver helpers.
// Reads secrets from process.env ONLY; never prints/writes raw secret values.
// Run scripts via: npx tsx --env-file=.env <script>
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const BASE = "http://127.0.0.1:3002";
export const TRACE_DIR = join(
  "cowork",
  "bulletproof-qa-2026-07-17",
  "evidence",
  "p8-rita-rejudge",
  "api-traces"
);

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) {
  throw new Error("E2E_TEST_SECRET missing from env — run with --env-file=.env");
}

export function clerkId(persona: string): string {
  return `user_qa_${persona}`;
}

export interface CallOpts {
  id: string; // e.g. "A1"
  label: string; // filename-safe label
  actor: string; // persona e.g. "p8"
  rawClerkId?: string; // if set, sent verbatim as x-e2e-clerk-id (bypasses the user_qa_ prefix helper) — for prefix-guard probes
  method: string;
  path: string; // e.g. "/api/books"
  body?: unknown; // JSON body (will be stringified)
  rawBody?: string; // raw body sent verbatim (for malformed-JSON probes)
  expected: string; // human-readable expectation
  note?: string;
}

export interface CallResult {
  id: string;
  label: string;
  actor: string;
  method: string;
  path: string;
  status: number;
  bodyText: string;
  bodyLen: number;
  contentType: string | null;
  expected: string;
  note?: string;
}

const results: CallResult[] = [];

export async function call(opts: CallOpts): Promise<CallResult> {
  const url = BASE + opts.path;
  const headers: Record<string, string> = {
    "x-e2e-test-secret": SECRET as string,
    "x-e2e-clerk-id": opts.rawClerkId ?? clerkId(opts.actor),
  };
  let sentBody: string | undefined;
  if (opts.rawBody !== undefined) {
    headers["Content-Type"] = "application/json";
    sentBody = opts.rawBody;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    sentBody = JSON.stringify(opts.body);
  }

  let status = 0;
  let bodyText = "";
  let contentType: string | null = null;
  try {
    const res = await fetch(url, {
      method: opts.method,
      headers,
      body: sentBody,
    });
    status = res.status;
    contentType = res.headers.get("content-type");
    bodyText = await res.text();
  } catch (e) {
    bodyText = `__FETCH_ERROR__ ${(e as Error).message}`;
  }

  const result: CallResult = {
    id: opts.id,
    label: opts.label,
    actor: opts.actor,
    method: opts.method,
    path: opts.path,
    status,
    bodyText,
    bodyLen: bodyText.length,
    contentType,
    expected: opts.expected,
    note: opts.note,
  };
  results.push(result);

  // Redact secret in stored request headers.
  const storedHeaders = { ...headers, "x-e2e-test-secret": "<E2E_TEST_SECRET redacted>" };
  const trace = {
    id: opts.id,
    label: opts.label,
    actor: opts.actor,
    capturedAt: new Date().toISOString(),
    request: {
      method: opts.method,
      url,
      headers: storedHeaders,
      body: opts.rawBody !== undefined ? opts.rawBody : opts.body ?? null,
      bodyMode: opts.rawBody !== undefined ? "raw" : opts.body !== undefined ? "json" : "none",
    },
    response: {
      status,
      contentType,
      bodyLength: bodyText.length,
      bodyText,
    },
    expected: opts.expected,
    note: opts.note ?? null,
  };
  const fname = `${opts.id}_${opts.label}.json`;
  writeFileSync(join(TRACE_DIR, fname), JSON.stringify(trace, null, 2), "utf8");

  const shortBody = bodyText.length > 160 ? bodyText.slice(0, 160) + "…" : bodyText;
  console.log(
    `[${opts.id}] ${opts.actor} ${opts.method} ${opts.path} -> ${status} (len=${bodyText.length}) exp:${opts.expected} :: ${shortBody.replace(/\n/g, " ")}`
  );
  return result;
}

export function dumpResults(fileLabel: string): void {
  writeFileSync(
    join(TRACE_DIR, `_${fileLabel}_results.json`),
    JSON.stringify(results, null, 2),
    "utf8"
  );
}

export async function getJson(actor: string, path: string): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(BASE + path, {
    method: "GET",
    headers: {
      "x-e2e-test-secret": SECRET as string,
      "x-e2e-clerk-id": clerkId(actor),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* leave null */
  }
  return { status: res.status, json, text };
}
