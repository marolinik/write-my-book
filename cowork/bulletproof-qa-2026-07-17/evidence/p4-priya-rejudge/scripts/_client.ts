/**
 * P4 "Priya" re-judge — shared HTTP client + trace dumper.
 *
 * SECURITY: reads E2E_TEST_SECRET from process.env (run with `--env-file=.env`)
 * and sends it ONLY in the request header. The secret is NEVER logged, dumped,
 * or written to any trace file. Auth model (src/lib/auth.ts): any `user_qa_*`
 * clerkId is admitted when the correct x-e2e-test-secret is presented.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.P4_BASE_URL ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p4";
export const TRACE_DIR =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p4-priya-rejudge/api-traces";
export const STATE_FILE =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p4-priya-rejudge/scripts/_state.json";

if (!SECRET) {
  throw new Error(
    "E2E_TEST_SECRET is not set — run tsx with `--env-file=.env`. (Secret is read from env, never printed.)"
  );
}

export interface ApiResult<T = unknown> {
  method: string;
  path: string;
  status: number;
  ok: boolean;
  latencyMs: number;
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
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const latencyMs = Date.now() - t0;
  const raw = await res.text();
  let json: T | null = null;
  let text: string | null = null;
  try {
    json = JSON.parse(raw) as T;
  } catch {
    text = raw;
  }
  return { method, path, status: res.status, ok: res.ok, latencyMs, json, text };
}

export function dump(name: string, obj: unknown): void {
  const file = join(TRACE_DIR, name.endsWith(".json") ? name : `${name}.json`);
  writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
  console.log(`  -> api-traces/${name.endsWith(".json") ? name : name + ".json"}`);
}

export function writeState(state: unknown): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
