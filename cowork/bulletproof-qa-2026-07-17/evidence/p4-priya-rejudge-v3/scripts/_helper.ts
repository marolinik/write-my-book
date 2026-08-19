/**
 * Shared helper for the P4 "Priya" rejudge-v3 evidence capture.
 * Drives the LIVE dev server (http://localhost:3002) as persona user_qa_p4
 * via the e2e header bypass. Secrets are read from process.env and NEVER
 * printed (mask() available if a value must surface).
 */
export const BASE = "http://localhost:3002";
export const CLERK_ID = "user_qa_p4";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) throw new Error("E2E_TEST_SECRET not set in env");

export function authHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-e2e-test-secret": SECRET as string,
    "x-e2e-clerk-id": CLERK_ID,
  };
}

/** Mask a secret to first-7 + last-4 if it must ever be surfaced. */
export function mask(v: string): string {
  if (v.length <= 11) return "***";
  return `${v.slice(0, 7)}...${v.slice(-4)}`;
}

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  raw: string;
  latencyMs: number;
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const latencyMs = Date.now() - t0;
  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* leave raw */
  }
  return { status: res.status, ok: res.ok, body: parsed as T, raw, latencyMs };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
