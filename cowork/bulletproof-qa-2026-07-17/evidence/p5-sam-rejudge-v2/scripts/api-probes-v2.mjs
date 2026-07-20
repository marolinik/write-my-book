// P5 Sam re-judge v2 — API probe harness (fixes NOW LIVE).
// Drives the LIVE app as UNSUBSCRIBED Sam (user_qa_p5, plan:null) and writes raw
// traces. Confirms the just-landed fixes (D-92 billing/AI-assist) AND drives the
// free-cap NEGATIVES the v1 capture only asserted (2nd-book 403 / export ungated /
// no-auth 401 / bad-secret 401).
//
// Secret read from process.env.E2E_TEST_SECRET (via `node --env-file=.env`); it is
// NEVER printed — traces reference it only as a masked token (first-7 + last-4).
//
// Run from repo root:
//   node --env-file=.env <thisfile> <OUT_DIR> <bookId> <chapterId>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2] || ".";
const BOOK_ID = process.argv[3] || null;
const CHAPTER_ID = process.argv[4] || null;
mkdirSync(OUT, { recursive: true });

if (!SECRET) {
  console.error("FATAL: E2E_TEST_SECRET not present in process.env (use --env-file=.env)");
  process.exit(2);
}

function mask(s) {
  if (typeof s !== "string" || s.length < 12) return "<redacted>";
  return s.slice(0, 7) + "..." + s.slice(-4);
}

function authHeaders(extra = {}) {
  return { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK_ID, ...extra };
}

const results = [];

// auth mode: "persona" (real secret+persona), "none" (no headers), or a custom
// header object (e.g. wrong secret). Secret value is never recorded raw.
async function probe(label, method, path, { body, headers, auth = "persona", badSecret } = {}) {
  const url = BASE + path;
  const started = Date.now();
  let reqHeaders;
  let authHeaderNames;
  if (auth === "none") {
    reqHeaders = { ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) };
    authHeaderNames = [];
  } else if (badSecret) {
    // deliberately-wrong secret control — the wrong value ("wrong-secret-control")
    // is a fixed literal, safe to record; the REAL secret is never sent/printed here
    reqHeaders = {
      "x-e2e-test-secret": "wrong-secret-control",
      "x-e2e-clerk-id": CLERK_ID,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(headers || {}),
    };
    authHeaderNames = ["x-e2e-test-secret(WRONG:wrong-secret-control)", "x-e2e-clerk-id:" + CLERK_ID];
  } else {
    reqHeaders = authHeaders({ ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) });
    authHeaderNames = ["x-e2e-test-secret(masked:" + mask(SECRET) + ")", "x-e2e-clerk-id:" + CLERK_ID];
  }

  let status = null, statusText = null, text = null, parsed = null, err = null, respHeaders = {};
  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });
    status = res.status;
    statusText = res.statusText;
    res.headers.forEach((v, k) => (respHeaders[k] = v));
    text = await res.text();
    try { parsed = JSON.parse(text); } catch { /* non-json */ }
  } catch (e) {
    err = String(e);
  }
  const ms = Date.now() - started;
  const trace = {
    label,
    request: { method, url, authMode: auth === "none" ? "NO-AUTH" : badSecret ? "WRONG-SECRET" : "persona", authHeaderNames, body: body ?? null },
    response: { status, statusText, ms, headers: respHeaders, json: parsed, textIfNotJson: parsed ? undefined : text },
    error: err,
    capturedAt: new Date().toISOString(),
  };
  results.push({ label, status, ms, err });
  const fname = join(OUT, label + ".json");
  mkdirSync(dirname(fname), { recursive: true });
  writeFileSync(fname, JSON.stringify(trace, null, 2));
  console.log(`[${status ?? "ERR"}] ${method} ${path}  (${ms}ms)  auth=${trace.request.authMode}  -> ${label}.json`);
  return trace;
}

// ---- env flags (booleans only, never values) ----
const envFlags = {
  capturedAt: new Date().toISOString(),
  env: {
    NODE_ENV: process.env.NODE_ENV ?? null,
    STRIPE_SECRET_KEY_set: !!process.env.STRIPE_SECRET_KEY,
    FREE_TIER_DISABLED: process.env.FREE_TIER_DISABLED ?? null,
    DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS ?? null,
    E2E_TEST_SECRET_set: !!process.env.E2E_TEST_SECRET,
  },
};
writeFileSync(join(OUT, "00-env-flags.json"), JSON.stringify(envFlags, null, 2));
console.log("ENV (booleans only):", JSON.stringify(envFlags.env));

console.log("\n=== P5 Sam re-judge v2 API probes (unsubscribed, fixes live) ===");

// 0. identity / auth sanity + current book inventory
const list0 = await probe("01-books-list", "GET", "/api/books");
const bookCountStart = Array.isArray(list0?.response?.json) ? list0.response.json.length : null;
console.log("books owned at start:", bookCountStart);

// 1. CONFIRM D-92 billing honesty: billing GET must now be 200 + freeTier snapshot (was 401)
await probe("02-subscription-get", "GET", "/api/billing/subscription");
await probe("02b-usage-get", "GET", "/api/usage");

// 2. NEGATIVE (a): 2nd book create must be capped at 403 (Free cap = 1 book)
await probe("10-create-2nd-book-cap-403", "POST", "/api/books", {
  body: { name: "Sam Second Book (cap probe) " + new Date().toISOString(), genre: "fantasy" },
});

// 3. NEGATIVE (b): export existing book must NOT be gated (200 / real export)
if (BOOK_ID) {
  await probe("20-export-existing-book", "POST", `/api/books/${BOOK_ID}/export`, {
    body: { format: "docx", isDraft: false },
  });
  await probe("20b-export-list", "GET", `/api/books/${BOOK_ID}/export`);
}

// 4. NEGATIVE (c): no-auth / no-secret control must be 401
await probe("30-noauth-subscription-401", "GET", "/api/billing/subscription", { auth: "none" });
await probe("31-noauth-books-list-401", "GET", "/api/books", { auth: "none" });
await probe("32-noauth-create-book-401", "POST", "/api/books", {
  auth: "none",
  body: { name: "no-auth control book", genre: "fantasy" },
});
// bad-secret control (right persona header, wrong secret) must also be 401
await probe("33-badsecret-subscription-401", "GET", "/api/billing/subscription", { badSecret: true });

// 5. CONFIRM D-92 AI-assist now works: ghost-text + inline-edit must be 200 (was 500)
if (BOOK_ID) {
  await probe("40-ghost-text-free", "POST", `/api/books/${BOOK_ID}/ghost-text`, {
    body: {
      context: "Sam opened the notebook and began to write. The words came",
      chapterNumber: 1,
    },
  });
  await probe("41-inline-edit-free", "POST", `/api/books/${BOOK_ID}/inline-edit`, {
    body: {
      selectedText: "The words came easily now",
      surroundingContext: "Sam opened the notebook. The words came easily now, no card required.",
      instruction: "make it more vivid",
      count: 3,
    },
  });
}

// 6. metered usage surfaced: billing GET again should show the Free meter advanced
await probe("42-subscription-after-ai", "GET", "/api/billing/subscription");

writeFileSync(join(OUT, "_probe-summary.json"), JSON.stringify({
  bookId: BOOK_ID, chapterId: CHAPTER_ID, bookCountStart, results,
}, null, 2));
console.log("\nSummary -> _probe-summary.json");
