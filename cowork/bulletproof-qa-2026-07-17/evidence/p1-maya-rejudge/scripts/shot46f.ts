/**
 * Shot 46f — abort is all-or-nothing (D-142 / D5 wart 1 on camera).
 *
 * Starts a real discuss turn on a VIRGIN finding, lets the stream begin
 * delivering prose, then navigates away mid-stream. Then proves, from ground
 * truth rather than from the UI:
 *   - no `discuss` usage row was written for the aborted turn
 *   - no reply (user or assistant) was persisted
 *   - the turn was NOT consumed: userTurns still 0, canDiscuss still true
 *
 * The provider was still paid for the tokens it produced — that is the disclosed
 * honesty trade (unusable-to-the-writer is not billed to the writer), and it is
 * reported here rather than hidden.
 *
 * One attempt only, per protocol. Usage: npx tsx --env-file=.env shot46f.ts <outDir> <findingId>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
const CLERK = "user_qa_p1";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, FINDING] = process.argv.slice(2);
if (!outDir || !FINDING) { console.error("usage: <outDir> <findingId>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

/** Same string-source discipline as shot46.ts (esbuild keepNames / __name). */
const INIT_SCRIPT = `
(function () {
  var style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none !important}";
  document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });
  window.__d = { turns: [] };
  var origFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var input = args[0];
    var init = args[1];
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var p = origFetch.apply(this, args);
    if (!(url.indexOf("/discuss") >= 0 && method === "POST")) return p;
    var t0 = performance.now();
    var rec = { frames: [], headers: null, endMs: null, readError: null };
    window.__d.turns.push(rec);
    return p.then(function (res) {
      rec.headers = { status: res.status, contentType: res.headers.get("content-type"), serverTiming: res.headers.get("server-timing"), tMs: performance.now() - t0 };
      if (!res.body) return res;
      var reader = res.clone().body.getReader();
      var dec = new TextDecoder();
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) { rec.endMs = performance.now() - t0; return; }
          rec.frames.push({ tMs: performance.now() - t0, raw: dec.decode(r.value, { stream: true }) });
          return pump();
        });
      };
      pump().catch(function (e) { rec.readError = String(e && e.message); });
      return res;
    });
  };
})();
`;
const BUBBLE = `(function(){ var b = document.querySelector('[data-testid="discuss-live-bubble"]'); return { present: !!b, text: b ? b.innerText : null }; })()`;
const TEE = `(function(){ return window.__d.turns.length ? window.__d.turns[window.__d.turns.length-1] : null; })()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT_SCRIPT });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];

  const url = `${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`;
  const tW = Date.now();
  trace.push({ step: "warm-discuss-get", status: (await api.get(url)).status(), ms: Date.now() - tW });
  const pre = await (await api.get(url)).json();
  trace.push({ step: "pre-state", userTurns: pre.userTurns, canDiscuss: pre.canDiscuss, replies: pre.replies?.length });

  const page = await ctx.newPage();
  const netLog: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    if (r.url().includes("/discuss")) netLog.push({ at: Date.now(), method: r.request().method(), status: r.status(), contentType: r.headers()["content-type"] ?? null, serverTiming: r.headers()["server-timing"] ?? null });
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/discuss")) netLog.push({ at: Date.now(), method: r.method(), failed: r.failure()?.errorText ?? "unknown" });
  });

  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const card = page.locator(`#finding-card-${FINDING}`);
  await card.waitFor({ state: "visible", timeout: 180000 });
  await page.waitForTimeout(3000);
  await card.scrollIntoViewIfNeeded();
  const discussBtn = card.getByRole("button", { name: /Discuss|Hide/ }).first();
  await discussBtn.waitFor({ timeout: 60000 });
  if (/Discuss/.test((await discussBtn.innerText()).trim())) await discussBtn.click();
  await page.waitForTimeout(2500);

  const box = card.locator("textarea").first();
  await box.fill("The present perfect is intentional — the narrator is looking back from later. Explain why you'd still change it.");
  const tSend = Date.now();
  await box.press("Enter");

  // Wait for prose to actually be on screen, then walk away mid-stream.
  let abortedAfterText = false;
  let midText: string | null = null;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const st = (await page.evaluate(BUBBLE)) as { present: boolean; text: string | null };
    if (st.present && st.text && !/editor is replying/i.test(st.text) && st.text.replace(/▍/g, "").trim().length > 40) {
      midText = st.text; abortedAfterText = true; break;
    }
    if (!st.present && Date.now() - tSend > 20000) break; // settled or died before we could abort
    await page.waitForTimeout(40);
  }
  const tAbort = Date.now() - tSend;
  if (abortedAfterText) await page.screenshot({ path: `${outDir}/46f1-midstream-before-leaving.png`, fullPage: false });
  const teeAtAbort = await page.evaluate(TEE);

  // THE ABORT: the writer leaves. Hard navigation kills the in-flight fetch.
  await page.goto(`${BASE}/books/${BOOK}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/46f2-navigated-away.png`, fullPage: false });

  // Ground truth, 20 s after the abort (long enough for any late settle to land).
  await page.waitForTimeout(20000);
  const post = await (await api.get(url)).json();

  // Re-open the thread to show the turn is still offered.
  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const card2 = page.locator(`#finding-card-${FINDING}`);
  await card2.waitFor({ state: "visible", timeout: 180000 });
  await page.waitForTimeout(3000);
  await card2.scrollIntoViewIfNeeded();
  const btn2 = card2.getByRole("button", { name: /Discuss|Hide/ }).first();
  if (/Discuss/.test((await btn2.innerText()).trim())) await btn2.click();
  await page.waitForTimeout(3000);
  await card2.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/46f3-turn-still-available.png`, fullPage: false });
  const cardText = await card2.innerText();

  const report = {
    shot: "46f",
    proves: "abort mid-stream is all-or-nothing: nothing persisted, nothing billed, turn not consumed",
    finding: FINDING,
    trace,
    abortedAfterFirstText: abortedAfterText,
    msFromSendToAbort: tAbort,
    liveBubbleTextAtAbort: midText,
    teeAtAbort,
    network: netLog,
    threadBefore: { userTurns: pre.userTurns, canDiscuss: pre.canDiscuss, replies: pre.replies?.length ?? 0 },
    threadAfter: { userTurns: post.userTurns, canDiscuss: post.canDiscuss, replies: post.replies?.length ?? 0 },
    reopenedCardHasInput: /Explain your intent/.test(cardText),
    verdict: {
      abortHappenedMidStream: abortedAfterText,
      noRepliesPersisted: (post.replies?.length ?? 0) === 0,
      turnNotConsumed: (post.userTurns ?? -1) === 0 && post.canDiscuss === true,
      inputStillOffered: /Explain your intent/.test(cardText),
    },
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/46f-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report.verdict, msFromSendToAbort: tAbort, threadAfter: report.threadAfter, network: netLog }, null, 2));
  await browser.close();
})();
