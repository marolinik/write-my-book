// P5 Sam re-judge v3 — ESCAPE HATCH: switch Sam's quick-assist/editor model
// (via the real settings route PATCH /api/settings/default-model) to a
// NON-reasoning model available on her seeded OpenRouter key, then re-fire
// ghost-text + inline-edit once each. Expect REAL suggestions (proving the
// D-100 422 is a model property, not a platform-wide break, and the settings
// deep-link the 422 copy points to actually works). Then restore the seeded
// reasoning default so the account is left as found.
//
// Tries a small ordered list of non-reasoning OpenRouter models and stops at
// the first that yields a usable ghost-text 200. Every attempt recorded RAW.
//
// Run:  npx tsx --env-file=.env <thisfile> <OUT_DIR> <bookId>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2];
const BOOK_ID = process.argv[3];
const ORIGINAL_MODEL = "openrouter-qwen36/sonnet";
const CANDIDATES = ["openrouter-deepseek/sonnet", "openrouter/haiku", "openrouter-kimi/sonnet"];
const REQ_TIMEOUT_MS = 150000;

if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(2); }
if (!OUT || !BOOK_ID) { console.error("FATAL: need <OUT_DIR> <bookId>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
function mask(s) { return typeof s === "string" && s.length >= 8 ? s.slice(0, 7) + "..." + s.slice(-4) : "<redacted>"; }
function authHeaders(extra = {}) { return { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK_ID, ...extra }; }

async function probe(label, method, path, { body } = {}) {
  const url = BASE + path;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  let status = null, statusText = null, parsed = null, text = null, err = null, aborted = false;
  const hasBody = body !== undefined;
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(hasBody ? { "content-type": "application/json" } : {}),
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    status = res.status; statusText = res.statusText;
    text = await res.text();
    try { parsed = JSON.parse(text); } catch { /* non-json */ }
  } catch (e) { err = String(e); aborted = ctrl.signal.aborted; }
  finally { clearTimeout(timer); }
  const ms = Date.now() - started;
  const trace = {
    label,
    request: { method, url, authHeaderNames: ["x-e2e-test-secret(masked:" + mask(SECRET) + ")", "x-e2e-clerk-id:" + CLERK_ID], body: body ?? null },
    response: { status, statusText, ms, json: parsed, textIfNotJson: parsed ? undefined : text },
    error: err, aborted, capturedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT, label + ".json"), JSON.stringify(trace, null, 2));
  console.log(`[${status ?? (aborted ? "TIMEOUT" : "ERR")}] ${method} ${path} (${ms}ms) -> ${label}.json`);
  return trace;
}

const attempts = [];

async function main() {
  let winner = null;
  for (let ci = 0; ci < CANDIDATES.length; ci++) {
    const model = CANDIDATES[ci];
    const tag = model.replace(/[^a-z0-9]+/gi, "-");
    const patch = await probe(`60-switch-${ci + 1}-${tag}`, "PATCH", "/api/settings/default-model", { body: { defaultModel: model } });
    const patchOk = patch.response.status === 200 && patch.response.json?.defaultModel === model;
    const ghost = await probe(`61-ghost-${ci + 1}-${tag}`, "POST", `/api/books/${BOOK_ID}/ghost-text`, {
      body: { context: "The lighthouse keeper climbed the last stair and looked out at the storm that was", chapterNumber: 1 },
    });
    const inline = await probe(`62-inline-${ci + 1}-${tag}`, "POST", `/api/books/${BOOK_ID}/inline-edit`, {
      body: { selectedText: "the storm that was coming", surroundingContext: "The lighthouse keeper looked out at the storm that was coming.", instruction: "make it more ominous", count: 3 },
    });
    const gj = ghost.response.json || {};
    const ij = inline.response.json || {};
    const ghostUsable = ghost.response.status === 200 && typeof gj.suggestion === "string" && gj.suggestion.trim().length > 0;
    const inlineUsable = inline.response.status === 200 && Array.isArray(ij.suggestions) && ij.suggestions.length > 0;
    const rec = {
      model, patchOk,
      ghostStatus: ghost.response.status, ghostUsable, ghostSample: (gj.suggestion || gj.error || "").slice(0, 160), ghostMs: ghost.response.ms,
      inlineStatus: inline.response.status, inlineUsable, inlineSample: (ij.suggestions || []).map((x) => `[${x.label}] ${x.text}`).slice(0, 3), inlineMs: inline.response.ms,
      inlineError: ij.error,
    };
    attempts.push(rec);
    if (ghostUsable && inlineUsable) { winner = rec; break; }
  }

  // Restore original seeded reasoning default (leave account as found).
  const restore = await probe("69-restore-default", "PATCH", "/api/settings/default-model", { body: { defaultModel: ORIGINAL_MODEL } });
  const verify = await probe("70-verify-restored", "GET", "/api/settings/default-model");

  writeFileSync(join(OUT, "_escape-hatch-summary.json"), JSON.stringify({
    capturedAt: new Date().toISOString(),
    originalModel: ORIGINAL_MODEL,
    candidatesTried: CANDIDATES,
    attempts,
    winner: winner ? winner.model : null,
    escapeHatchWorks: !!winner,
    restoredTo: verify.response.json?.defaultModel ?? null,
    restoredOk: verify.response.json?.defaultModel === ORIGINAL_MODEL,
  }, null, 2));
  console.log("\n=== ESCAPE HATCH ===");
  console.log(JSON.stringify({ winner: winner ? winner.model : null, attempts }, null, 2));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
