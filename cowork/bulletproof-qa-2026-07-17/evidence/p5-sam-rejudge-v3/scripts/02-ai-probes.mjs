// P5 Sam re-judge v3 — D-100 LIVE re-test harness (THE floor driver).
//
// Drives the LIVE app http://localhost:3002 as UNSUBSCRIBED Sam (user_qa_p5,
// plan:null) on her seeded reasoning-model default (openrouter-qwen36/sonnet →
// qwen/qwen3.6-27b). Fires ghost-text >=6 and inline-edit >=4 on real prose.
//
// ACCEPTANCE (founder ruling): every attempt must end in EITHER
//   (a) a real usable suggestion (HTTP 200 with non-empty text), OR
//   (b) HTTP 422 { error, code:"MODEL_NO_QUICK_SUGGEST" } with plain-language copy.
// FAIL if any attempt returns the old generic retryable 502 "cut off", hangs
// (abort), or returns an empty-200.
//
// Also captures the billing/subscription freeTier snapshot before & after the
// AI run (D-99 re-check + Free-tier meter advance), plus adversarial envelopes
// (malformed JSON, oversized selection) for the value sweep.
//
// Secret read from process.env.E2E_TEST_SECRET (via --env-file=.env); NEVER
// printed — referenced only as a masked token.
// Run:  npx tsx --env-file=.env <thisfile> <OUT_DIR> <bookId>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2];
const BOOK_ID = process.argv[3];
const REQ_TIMEOUT_MS = 150000;

if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing (use --env-file=.env)"); process.exit(2); }
if (!OUT || !BOOK_ID) { console.error("FATAL: need <OUT_DIR> <bookId>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });

function mask(s) { return typeof s === "string" && s.length >= 8 ? s.slice(0, 7) + "..." + s.slice(-4) : "<redacted>"; }
function authHeaders(extra = {}) { return { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK_ID, ...extra }; }

const summary = [];

// method/path + options. auth: "persona" | "none". rawBody sends a literal
// (possibly malformed) string; body sends JSON.stringify(body).
async function probe(label, method, path, { body, rawBody, auth = "persona" } = {}) {
  const url = BASE + path;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  let status = null, statusText = null, parsed = null, text = null, err = null, aborted = false;
  const hasBody = body !== undefined || rawBody !== undefined;
  const headers =
    auth === "none"
      ? { ...(hasBody ? { "content-type": "application/json" } : {}) }
      : authHeaders(hasBody ? { "content-type": "application/json" } : {});
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    status = res.status; statusText = res.statusText;
    text = await res.text();
    try { parsed = JSON.parse(text); } catch { /* non-json */ }
  } catch (e) {
    err = String(e);
    aborted = ctrl.signal.aborted;
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - started;
  const trace = {
    label,
    request: {
      method, url,
      authMode: auth === "none" ? "NO-AUTH" : "persona",
      authHeaderNames: auth === "none" ? [] : ["x-e2e-test-secret(masked:" + mask(SECRET) + ")", "x-e2e-clerk-id:" + CLERK_ID],
      body: rawBody !== undefined ? { __rawLiteral: rawBody } : body ?? null,
    },
    response: { status, statusText, ms, json: parsed, textIfNotJson: parsed ? undefined : text },
    error: err, aborted,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT, label + ".json"), JSON.stringify(trace, null, 2));
  console.log(`[${status ?? (aborted ? "TIMEOUT" : "ERR")}] ${method} ${path} (${ms}ms) -> ${label}.json`);
  return trace;
}

// Classify a quick-assist attempt against the D-100 acceptance rule.
function classifyQuickAssist(trace, kind) {
  const s = trace.response.status;
  const j = trace.response.json || {};
  if (trace.aborted) return { label: trace.label, kind, status: "TIMEOUT", verdict: "FAIL-HANG", ms: trace.response.ms };
  if (s === 200) {
    const usable =
      kind === "ghost"
        ? typeof j.suggestion === "string" && j.suggestion.trim().length > 0
        : Array.isArray(j.suggestions) && j.suggestions.length > 0 &&
          j.suggestions.every((x) => x && typeof x.text === "string" && x.text.trim().length > 0);
    return {
      label: trace.label, kind, status: 200,
      verdict: usable ? "PASS-a-REAL" : "FAIL-EMPTY-200",
      ms: trace.response.ms,
      sample: kind === "ghost" ? (j.suggestion || "").slice(0, 160) : (j.suggestions || []).map((x) => `[${x.label}] ${x.text}`).slice(0, 3),
    };
  }
  if (s === 422 && j.code === "MODEL_NO_QUICK_SUGGEST") {
    return { label: trace.label, kind, status: 422, verdict: "PASS-b-422", ms: trace.response.ms, error: j.error };
  }
  if (s === 502) return { label: trace.label, kind, status: 502, verdict: "FAIL-OLD-502-CUTOFF", ms: trace.response.ms, error: j.error };
  return { label: trace.label, kind, status: s, verdict: "FAIL-UNEXPECTED", ms: trace.response.ms, body: j };
}

// Varied real-prose contexts for ghost-text.
const GHOST = [
  "Sam opened the notebook and began to write. The words came",
  "The rain hadn't stopped for three days. Mara pressed her hand to the cold window and",
  "He counted the coins twice, then a third time, before he understood what the innkeeper meant when he",
  "The letter was still sealed. She turned it over in her hands, feeling the weight of what her father had",
  "By the time the ferry reached the far shore, the fog had swallowed the harbor lights and",
  "\"You shouldn't have come back,\" the old woman said, and the fire between them",
];

// Varied inline-edit selections.
const INLINE = [
  { selectedText: "The words came easily now", surroundingContext: "Sam opened the notebook. The words came easily now, no card required.", instruction: "make it more vivid" },
  { selectedText: "The rain hadn't stopped for three days", surroundingContext: "The rain hadn't stopped for three days. Mara pressed her hand to the cold window.", instruction: "tighten the pacing" },
  { selectedText: "He counted the coins twice", surroundingContext: "He counted the coins twice, then a third time, before he understood.", instruction: "add sensory detail" },
  { selectedText: "the fog had swallowed the harbor lights", surroundingContext: "By the time the ferry reached the far shore, the fog had swallowed the harbor lights.", instruction: "vary the rhythm" },
];

async function main() {
  // 0. Confirm the live default-model is still the reasoning model (D-100 case).
  await probe("00-default-model-get", "GET", "/api/settings/default-model");

  // 1. D-99 re-check — billing/subscription should now be 200 + freeTier snapshot.
  await probe("10-billing-before", "GET", "/api/billing/subscription");
  await probe("11-usage-before", "GET", "/api/usage");

  // 2. D-100 re-test — ghost-text x6 on the reasoning default.
  for (let i = 0; i < GHOST.length; i++) {
    const t = await probe(`20-ghost-${i + 1}`, "POST", `/api/books/${BOOK_ID}/ghost-text`, {
      body: { context: GHOST[i], chapterNumber: 1 },
    });
    summary.push(classifyQuickAssist(t, "ghost"));
  }

  // 3. D-100 re-test — inline-edit x4 on the reasoning default.
  for (let i = 0; i < INLINE.length; i++) {
    const t = await probe(`21-inline-${i + 1}`, "POST", `/api/books/${BOOK_ID}/inline-edit`, {
      body: { ...INLINE[i], count: 3 },
    });
    summary.push(classifyQuickAssist(t, "inline"));
  }

  // 4. Billing after — Free-tier meter should have advanced by the number of
  //    GENUINE (200) successes only.
  await probe("30-billing-after", "GET", "/api/billing/subscription");

  // 5. Adversarial envelopes (value sweep D5/D3): malformed JSON + oversized selection.
  await probe("40-ghost-malformed-json", "POST", `/api/books/${BOOK_ID}/ghost-text`, {
    rawBody: '{ "context": "Sam opened the notebook", "chapterNumber": ',
  });
  await probe("41-inline-oversized-selection", "POST", `/api/books/${BOOK_ID}/inline-edit`, {
    body: { selectedText: "x".repeat(10001), instruction: "improve", count: 3 },
  });
  // ghost-text oversized context (>2000) — bounded-input control
  await probe("42-ghost-oversized-context", "POST", `/api/books/${BOOK_ID}/ghost-text`, {
    body: { context: "y".repeat(2001), chapterNumber: 1 },
  });

  writeFileSync(join(OUT, "_d100-classification.json"), JSON.stringify({
    capturedAt: new Date().toISOString(),
    bookId: BOOK_ID,
    acceptanceRule: "each ghost/inline attempt must be PASS-a-REAL (200 usable) OR PASS-b-422 (MODEL_NO_QUICK_SUGGEST); any FAIL-* is a D-100 regression",
    attempts: summary,
    distribution: summary.reduce((acc, s) => { acc[s.verdict] = (acc[s.verdict] || 0) + 1; return acc; }, {}),
    allPass: summary.every((s) => s.verdict === "PASS-a-REAL" || s.verdict === "PASS-b-422"),
    genuine200Count: summary.filter((s) => s.verdict === "PASS-a-REAL").length,
  }, null, 2));
  console.log("\n=== D-100 classification ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
