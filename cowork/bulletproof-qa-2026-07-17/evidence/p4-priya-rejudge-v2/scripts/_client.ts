/**
 * P4 "Priya" RE-JUDGE v2 — shared HTTP client + trace dumper.
 *
 * SECURITY: reads E2E_TEST_SECRET from process.env (run with `--env-file=.env`).
 * The secret is sent ONLY in the request header. It is NEVER logged, dumped,
 * or written to any trace file. Auth model (src/lib/auth.ts): any `user_qa_*`
 * clerkId is admitted when the correct x-e2e-test-secret is presented.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.P4_BASE_URL ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p4";

export const TRACE_DIR =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p4-priya-rejudge-v2/api-traces";
export const STATE_FILE =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p4-priya-rejudge-v2/scripts/_state.json";

if (!SECRET) {
  throw new Error(
    "E2E_TEST_SECRET not set — run tsx with `--env-file=.env`. (Secret read from env, never printed.)"
  );
}

export interface ApiResult<T = unknown> {
  method: string;
  path: string;
  status: number;
  ok: boolean;
  latencyMs: number;
  wallClockUtc: string;
  json: T | null;
  text: string | null;
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    "x-e2e-test-secret": SECRET as string,
    "x-e2e-clerk-id": CLERK,
    "content-type": "application/json",
  };
  const t0 = Date.now();
  const wallClockUtc = new Date().toISOString();
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const latencyMs = Date.now() - t0;
  const raw = await res.text();
  let json: T | null = null;
  try {
    json = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    json = null;
  }
  return {
    method,
    path,
    status: res.status,
    ok: res.ok,
    latencyMs,
    wallClockUtc,
    json,
    text: json == null ? raw : null,
  };
}

export function dump(name: string, obj: unknown): void {
  const file = join(TRACE_DIR, name.endsWith(".json") ? name : `${name}.json`);
  writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
  console.log(`  wrote api-traces/${name.endsWith(".json") ? name : name + ".json"}`);
}

export function writeState(state: unknown): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
