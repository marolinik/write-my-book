// P5 Sam re-judge v3 — baseline-driver re-check (D-101) + value sweep (D11/D5/D3).
//
//  - env flags (booleans / non-secret values only) for the D-101 caveat.
//  - D-101 no-auth negative control: header-less + wrong-secret requests.
//  - Value sweep: real save round-trip (GET content -> PUT with optimistic-lock
//    stamp -> GET confirm) and an export sanity check (docx export intact).
//
// Secret read from process.env.E2E_TEST_SECRET (via --env-file=.env); NEVER
// printed. Run:  npx tsx --env-file=.env <thisfile> <OUT_DIR> <bookId> <chapterId>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2];
const BOOK_ID = process.argv[3];
const CHAPTER_ID = process.argv[4];
const REQ_TIMEOUT_MS = 120000;

if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(2); }
if (!OUT || !BOOK_ID || !CHAPTER_ID) { console.error("FATAL: need <OUT_DIR> <bookId> <chapterId>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
function mask(s) { return typeof s === "string" && s.length >= 8 ? s.slice(0, 7) + "..." + s.slice(-4) : "<redacted>"; }
function authHeaders(extra = {}) { return { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK_ID, ...extra }; }

// auth: "persona" | "none" | "badsecret"
async function probe(label, method, path, { body, auth = "persona" } = {}) {
  const url = BASE + path;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  let status = null, statusText = null, parsed = null, text = null, err = null, aborted = false;
  const hasBody = body !== undefined;
  let headers, authMode, authHeaderNames;
  if (auth === "none") {
    headers = hasBody ? { "content-type": "application/json" } : {};
    authMode = "NO-AUTH"; authHeaderNames = [];
  } else if (auth === "badsecret") {
    headers = { "x-e2e-test-secret": "wrong-secret-control", "x-e2e-clerk-id": CLERK_ID, ...(hasBody ? { "content-type": "application/json" } : {}) };
    authMode = "WRONG-SECRET"; authHeaderNames = ["x-e2e-test-secret(WRONG:wrong-secret-control)", "x-e2e-clerk-id:" + CLERK_ID];
  } else {
    headers = authHeaders(hasBody ? { "content-type": "application/json" } : {});
    authMode = "persona"; authHeaderNames = ["x-e2e-test-secret(masked:" + mask(SECRET) + ")", "x-e2e-clerk-id:" + CLERK_ID];
  }
  try {
    const res = await fetch(url, { method, headers, body: hasBody ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    status = res.status; statusText = res.statusText;
    text = await res.text();
    try { parsed = JSON.parse(text); } catch { /* non-json */ }
  } catch (e) { err = String(e); aborted = ctrl.signal.aborted; }
  finally { clearTimeout(timer); }
  const ms = Date.now() - started;
  const trace = {
    label,
    request: { method, url, authMode, authHeaderNames, body: body ?? null },
    response: { status, statusText, ms, json: parsed, textIfNotJson: parsed ? undefined : text },
    error: err, aborted, capturedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT, label + ".json"), JSON.stringify(trace, null, 2));
  console.log(`[${status ?? (aborted ? "TIMEOUT" : "ERR")}] ${method} ${path} (${ms}ms) auth=${authMode} -> ${label}.json`);
  return trace;
}

async function main() {
  // ---- env flags (booleans / non-secret values only) — D-101 caveat ----
  const envFlags = {
    capturedAt: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV ?? null,
      DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS ?? null,
      FREE_TIER_DISABLED: process.env.FREE_TIER_DISABLED ?? null,
      STRIPE_SECRET_KEY_set: !!process.env.STRIPE_SECRET_KEY,
      E2E_TEST_SECRET_set: !!process.env.E2E_TEST_SECRET,
    },
  };
  writeFileSync(join(OUT, "80-env-flags.json"), JSON.stringify(envFlags, null, 2));
  console.log("ENV:", JSON.stringify(envFlags.env));

  // ---- D-101 no-auth / bad-secret negative control ----
  await probe("81-noauth-books-list", "GET", "/api/books", { auth: "none" });
  await probe("82-noauth-billing", "GET", "/api/billing/subscription", { auth: "none" });
  await probe("83-badsecret-billing", "GET", "/api/billing/subscription", { auth: "badsecret" });

  // ---- Value sweep: real save round-trip (write prose -> save -> confirm) ----
  const before = await probe("90-content-get-before", "GET", `/api/books/${BOOK_ID}/chapters/${CHAPTER_ID}/content`);
  const curVersion = before.response.json?.version ?? null;
  const curMarkdown = before.response.json?.markdown ?? "";
  const appended = (curMarkdown ? curMarkdown.trimEnd() + "\n\n" : "") +
    "Sam added one more line before closing the notebook, and for the first time the page felt like a beginning.";
  await probe("91-content-put-save", "PUT", `/api/books/${BOOK_ID}/chapters/${CHAPTER_ID}/content`, {
    body: { markdown: appended, expectedVersion: typeof curVersion === "number" ? curVersion : undefined, changeSource: "user" },
  });
  await probe("92-content-get-after", "GET", `/api/books/${BOOK_ID}/chapters/${CHAPTER_ID}/content`);

  // ---- Export sanity (D11: export never gated) ----
  await probe("95-export-docx", "POST", `/api/books/${BOOK_ID}/export`, { body: { format: "docx", isDraft: false } });
  await probe("96-export-list", "GET", `/api/books/${BOOK_ID}/export`);

  console.log("\n=== drivers + value sweep done ===");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
