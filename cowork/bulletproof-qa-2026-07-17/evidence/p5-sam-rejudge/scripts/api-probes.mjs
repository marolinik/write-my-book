// P5 Sam re-judge — API probe harness.
// Runs sequential probes as UNSUBSCRIBED Sam (user_qa_p5) and writes raw traces.
// Secret is read from process.env.E2E_TEST_SECRET (via `node --env-file=.env`);
// it is NEVER printed. Run from repo root:  node --env-file=.env <thisfile>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2] || ".";
mkdirSync(OUT, { recursive: true });

if (!SECRET) {
  console.error("FATAL: E2E_TEST_SECRET not present in process.env (use --env-file=.env)");
  process.exit(2);
}

function authHeaders(extra = {}) {
  return {
    "x-e2e-test-secret": SECRET,
    "x-e2e-clerk-id": CLERK_ID,
    ...extra,
  };
}

function mask(s) {
  if (typeof s !== "string" || s.length < 12) return "<redacted>";
  return s.slice(0, 7) + "..." + s.slice(-4);
}

const results = [];

async function probe(label, method, path, { body, headers, noAuth } = {}) {
  const url = BASE + path;
  const started = Date.now();
  const reqHeaders = noAuth
    ? { ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) }
    : authHeaders({ ...(body ? { "content-type": "application/json" } : {}), ...(headers || {}) });
  let status = null,
    statusText = null,
    text = null,
    parsed = null,
    err = null,
    respHeaders = {};
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
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-json */
    }
  } catch (e) {
    err = String(e);
  }
  const ms = Date.now() - started;
  const trace = {
    label,
    request: {
      method,
      url,
      // header names only for auth; secret value NEVER included
      authHeaderNames: noAuth ? [] : ["x-e2e-test-secret(masked:" + mask(SECRET) + ")", "x-e2e-clerk-id:" + CLERK_ID],
      body: body ?? null,
    },
    response: { status, statusText, ms, headers: respHeaders, json: parsed, textIfNotJson: parsed ? undefined : text },
    error: err,
    capturedAt: new Date().toISOString(),
  };
  results.push({ label, status, ms, err });
  const fname = join(OUT, label + ".json");
  mkdirSync(dirname(fname), { recursive: true });
  writeFileSync(fname, JSON.stringify(trace, null, 2));
  console.log(`[${status ?? "ERR"}] ${method} ${path}  (${ms}ms)  -> ${label}.json`);
  return trace;
}

const bookTitle = "Sam Free-Tier On-Ramp QA " + new Date().toISOString().slice(0, 10);

// ---- run sequence ----
console.log("=== P5 Sam re-judge API probes (unsubscribed) ===");

// 0. identity / auth sanity
await probe("00-whoami-books-list", "GET", "/api/books");

// 1. subscription/billing GET (references db.freeTierUsage — deploy-gate canary)
await probe("01-subscription-get", "GET", "/api/billing/subscription");
await probe("01b-usage-get", "GET", "/api/usage");

// 2. D-08 CARD-FREE ON-RAMP: create a book as unsubscribed Sam
const created = await probe("02-create-book-freetier", "POST", "/api/books", {
  body: { name: bookTitle, genre: "fantasy" },
});
let bookId = created?.response?.json?.id || created?.response?.json?.book?.id || created?.response?.json?.data?.id || null;
let chapterId = created?.response?.json?.firstChapterId || null;

// 3. confirm book now owned + reachable
if (bookId) {
  await probe("03-get-created-book", "GET", `/api/books/${bookId}`);
  await probe("03b-list-books-after-create", "GET", "/api/books");
}

// 3c. TYPE WORDS (autosave) — must be UNGATED for a free writer (no paywall)
if (bookId && chapterId) {
  await probe("03c-type-words-autosave", "PUT", `/api/books/${bookId}/chapters/${chapterId}/content`, {
    body: {
      markdown:
        "# Chapter One\n\nSam opened the notebook and began to write. The words came easily now, no card required, no wall in the way. This is the free-tier on-ramp working end to end.",
      changeSource: "qa-p5-rejudge",
    },
  });
  // read it back to prove persistence
  await probe("03d-read-back-content", "GET", `/api/books/${bookId}/chapters/${chapterId}/content`);
}

// 4. D-12 honesty: language sweep. ar must now REJECT (honest), en/fr must 200.
await probe("04-lang-ar", "PATCH", "/api/settings/language", { body: { language: "ar" } });
await probe("04-lang-fr", "PATCH", "/api/settings/language", { body: { language: "fr" } });
await probe("04-lang-en-reset", "PATCH", "/api/settings/language", { body: { language: "en" } });
await probe("04b-lang-get", "GET", "/api/settings/language");

// 5. free-tier value: try an AI assist (ghost-text / agent) on the new book (metered but should be reachable, not paywalled)
if (bookId) {
  // fetch chapters to get a chapter id for writing
  await probe("05-book-chapters", "GET", `/api/books/${bookId}/chapters`);
}

writeFileSync(join(OUT, "_probe-summary.json"), JSON.stringify({ bookId, bookTitle, results }, null, 2));
console.log("\nBookId created:", bookId);
console.log("Summary -> _probe-summary.json");
