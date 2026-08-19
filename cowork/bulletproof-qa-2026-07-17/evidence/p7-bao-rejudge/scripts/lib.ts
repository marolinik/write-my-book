// Shared harness for P7 Bao rejudge. Reads secrets from process.env ONLY.
// Never prints secret values. Run via: npx tsx --env-file=.env scripts/<x>.ts
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export const BASE = "http://localhost:3002";
export const CLERK_ID = "user_qa_p7";
export const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

const secret = process.env.E2E_TEST_SECRET;
if (!secret) {
  console.error("FATAL: E2E_TEST_SECRET not present in process.env");
  process.exit(1);
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-e2e-test-secret": secret as string,
    "x-e2e-clerk-id": CLERK_ID,
    "content-type": "application/json",
    ...extra,
  };
}

export interface TraceEntry {
  label: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  reqBodyPreview?: string;
  respBody?: unknown;
  note?: string;
  ts: string;
}

const traces: TraceEntry[] = [];

export async function apiJson(
  label: string,
  method: string,
  path: string,
  body?: unknown,
  headersExtra: Record<string, string> = {}
): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, {
    method,
    headers: authHeaders(headersExtra),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  const bp = body === undefined ? undefined : JSON.stringify(body);
  traces.push({
    label, method, url, status: res.status, ok: res.ok,
    reqBodyPreview: bp && bp.length > 400 ? bp.slice(0, 400) + `…(${bp.length} chars)` : bp,
    respBody: json ?? (text.length > 600 ? text.slice(0, 600) + "…" : text),
    ts: new Date().toISOString(),
  });
  return { status: res.status, ok: res.ok, json, text };
}

export async function apiRaw(
  label: string,
  method: string,
  path: string,
  headersExtra: Record<string, string> = {}
): Promise<{ status: number; ok: boolean; buf: Buffer; headers: Headers }> {
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, { method, headers: authHeaders(headersExtra) });
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  traces.push({
    label, method, url, status: res.status, ok: res.ok,
    note: `binary ${buf.length} bytes; content-type=${res.headers.get("content-type")}; content-disposition=${res.headers.get("content-disposition")}`,
    respBody: undefined,
    ts: new Date().toISOString(),
  });
  return { status: res.status, ok: res.ok, buf, headers: res.headers };
}

export function pushTrace(t: Omit<TraceEntry, "ts">) {
  traces.push({ ...t, ts: new Date().toISOString() });
}

export function flushTraces(filename: string) {
  const dir = join(BUNDLE, "api-traces");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), JSON.stringify(traces, null, 2), "utf-8");
  console.log(`wrote ${traces.length} traces -> api-traces/${filename}`);
}

export function saveArtifact(name: string, data: string | Buffer) {
  const dir = join(BUNDLE, "artifacts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), data);
  console.log(`wrote artifact -> artifacts/${name}`);
}

export function saveJson(name: string, obj: unknown) {
  saveArtifact(name, JSON.stringify(obj, null, 2));
}
