/**
 * P2 Gerald RE-JUDGE — shared live-driver client.
 *
 * Reads secrets from process.env ONLY (run: npx tsx --env-file=.env <script>).
 * NEVER prints raw secret values. Acts as persona user_qa_p2 over real HTTP
 * against the LIVE dev server (current committed code).
 */
export const BASE = process.env.QA_BASE_URL ?? "http://localhost:3002";
export const CLERK_ID = "user_qa_p2";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) {
  console.error("FATAL: E2E_TEST_SECRET not in process.env (need --env-file=.env)");
  process.exit(3);
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-e2e-test-secret": SECRET as string,
    "x-e2e-clerk-id": CLERK_ID,
    "content-type": "application/json",
    ...extra,
  };
}

export interface Trace {
  label: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  body: unknown;
  ms: number;
}

/** Fetch returning status + parsed body (json if possible, else text) + timing. */
export async function call(
  method: string,
  path: string,
  opts: { body?: unknown; rawBody?: string; label?: string; headers?: Record<string, string> } = {}
): Promise<Trace> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const init: RequestInit = { method, headers: authHeaders(opts.headers) };
  if (opts.rawBody !== undefined) init.body = opts.rawBody;
  else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const t0 = performance.now();
  const res = await fetch(url, init);
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let body: unknown = text;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(text); } catch { /* keep text */ }
  }
  return {
    label: opts.label ?? `${method} ${path}`,
    method,
    url,
    status: res.status,
    ok: res.ok,
    body,
    ms,
  };
}

export function line(t: Trace): string {
  const b = typeof t.body === "string" ? t.body.slice(0, 400) : JSON.stringify(t.body);
  return `[${t.status}] ${t.method} ${t.url} (${t.ms}ms) :: ${b?.toString().slice(0, 600)}`;
}

/** Mask a secret-ish string: first-7 + last-4, middle redacted. */
export function mask(s: string | null | undefined): string {
  if (!s) return "<none>";
  if (s.length <= 12) return `${s.slice(0, 2)}…(${s.length}ch)`;
  return `${s.slice(0, 7)}…${s.slice(-4)} (${s.length}ch)`;
}
