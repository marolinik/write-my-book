// Characterize the free_tier_usage missing-table blast radius on AI-assist.
// Also reports (boolean only) whether STRIPE_SECRET_KEY / FREE_TIER_DISABLED
// are set — NEVER the values.
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2] || ".";
const bookId = process.argv[3];

const env = {
  STRIPE_SECRET_KEY_set: !!process.env.STRIPE_SECRET_KEY,
  FREE_TIER_DISABLED: process.env.FREE_TIER_DISABLED ?? null,
  NODE_ENV: process.env.NODE_ENV ?? null,
};

function headers(json) {
  return {
    "x-e2e-test-secret": SECRET,
    "x-e2e-clerk-id": CLERK_ID,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function probe(label, method, path, body) {
  const url = BASE + path;
  const t = Date.now();
  let status = null, json = null, text = null, err = null;
  try {
    const res = await fetch(url, { method, headers: headers(!!body), body: body ? JSON.stringify(body) : undefined });
    status = res.status;
    text = await res.text();
    try { json = JSON.parse(text); } catch {}
  } catch (e) { err = String(e); }
  const trace = { label, request: { method, url, body: body ?? null }, response: { status, ms: Date.now() - t, json, textIfNotJson: json ? undefined : text }, error: err, capturedAt: new Date().toISOString() };
  writeFileSync(join(OUT, label + ".json"), JSON.stringify(trace, null, 2));
  console.log(`[${status ?? "ERR"}] ${method} ${path} -> ${label}.json`);
  return trace;
}

console.log("ENV (booleans only):", JSON.stringify(env));
writeFileSync(join(OUT, "06-env-flags.json"), JSON.stringify({ capturedAt: new Date().toISOString(), env }, null, 2));

if (!bookId) { console.error("no bookId arg; skipping ai-assist probes"); process.exit(0); }

await probe("06-ghost-text-free", "POST", `/api/books/${bookId}/ghost-text`, {
  context: "Sam opened the notebook and began to write. The words came",
  chapterNumber: 1,
});
await probe("06-inline-edit-free", "POST", `/api/books/${bookId}/inline-edit`, {
  selectedText: "The words came easily now",
  surroundingContext: "Sam opened the notebook. The words came easily now, no card required.",
  instruction: "make it more vivid",
  count: 3,
});
