/**
 * 50a — D-188 declared-document artifact contract, ON CAMERA as P2 Gerald.
 *
 * Book 90436e20 holds the pre-fix contrast case: TWO `create-story-bible`
 * sessions stamped `completed` (05:38 and 05:43) and ZERO STORY_BIBLE rows.
 * This shot drives the same workflow from the setup wizard's own Story Bible
 * step and records which post-fix branch fires:
 *   RECOVERY  -> "Saved your Story Bible document ..."  (change_source transcript-recovery)
 *   HONESTY   -> "The Story Bible was NOT saved ..."     (session status failed)
 *   SUCCESS   -> model called WriteDocument itself, no contract message
 *
 * HARNESS NOTE (43/46/47-series): every in-page snippet is a raw SOURCE
 * STRING. tsx/esbuild runs keepNames and rewrites arrows into __name(...),
 * which throws `__name is not defined` inside the page.
 *
 * Usage: npx tsx --env-file=.env shot50a.ts
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const BOOK = "90436e20-ffc7-42ca-a39f-dc7d48cdda10";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const OUT = "../shots";
const HIDE = "nextjs-portal{display:none !important}";

const INIT = `
(function () {
  var style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none !important}";
  document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });
  window.__a = { posts: [] };
  var origFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var input = args[0]; var init = args[1] || {};
    var url = (typeof input === "string" ? input : (input && input.url) || "");
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var isStart = url.indexOf("/agent") >= 0 && method === "POST";
    var p = origFetch.apply(this, args);
    if (!isStart) return p;
    var t0 = Date.now();
    return p.then(function (res) {
      res.clone().text().then(function (txt) {
        window.__a.posts.push({ url: url, status: res.status, body: txt.slice(0, 600), tookMs: Date.now() - t0 });
      }).catch(function () {});
      return res;
    });
  };
})();
`;

const PROBE = `(function(){
  var t = document.body.innerText || "";
  var dest = Array.prototype.slice.call(document.querySelectorAll('[class*="text-destructive"]'))
    .map(function(e){ return (e.innerText || "").trim(); })
    .filter(function(s){ return s.length > 0; });
  var spin = document.querySelectorAll("svg.animate-spin, .animate-spin").length;
  return {
    ms: Math.round(performance.now()),
    running: spin > 0,
    notSaved: /was NOT saved/.test(t),
    recovered: /Saved your [A-Za-z ]*document/.test(t),
    recoveredPhrase: (t.match(/Saved your[^\\n]*/) || [])[0] || null,
    notSavedPhrase: (t.match(/[^\\n]*was NOT saved[^\\n]*/) || [])[0] || null,
    statusComplete: /Session complete|Suggested next|View document/i.test(t),
    destructive: dest,
    tail: t.slice(-1400)
  };
})()`;

const POSTS = `(function(){ return window.__a ? window.__a.posts : null; })()`;

function log(m: string) { console.log(`[50a ${new Date().toISOString().slice(11, 19)}] ${m}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));

  await page.goto(`${BASE}/books/${BOOK}/setup`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);

  // Walk to the Story Bible step via the wizard's own step bar.
  const stepBtn = page.getByRole("button", { name: /Story Bible/i });
  const stepCount = await stepBtn.count();
  log(`step-bar candidates matching /Story Bible/i: ${stepCount}`);
  if (stepCount) { await stepBtn.first().click(); await page.waitForTimeout(2000); }

  await page.screenshot({ path: `${OUT}/50a1-bible-step-before.png`, fullPage: false });
  const before = await page.evaluate(PROBE);

  const createBtn = page.getByRole("button", { name: /^Create Story Bible$/ });
  const haveCreate = await createBtn.count();
  log(`"Create Story Bible" buttons: ${haveCreate}`);
  if (!haveCreate) {
    writeFileSync(`${OUT}/50a-assertions.json`, JSON.stringify({ verdict: "UNREACHABLE", reason: "no Create Story Bible button on bible step", before, pageErrors }, null, 2));
    await browser.close();
    return;
  }

  const t0 = Date.now();
  await createBtn.first().click();
  await page.waitForTimeout(20000);
  await page.screenshot({ path: `${OUT}/50a2-agent-running.png`, fullPage: false });

  // Poll to terminal state.
  const samples: any[] = [];
  let last: string | null = null;
  let terminal = false;
  const LIMIT_MS = 600000;
  while (Date.now() - t0 < LIMIT_MS) {
    const s: any = await page.evaluate(PROBE);
    const key = [s.running, s.notSaved, s.recovered, s.statusComplete, s.destructive.join("|"), s.tail.length].join("~");
    if (last !== key) { samples.push({ ...s, atS: Math.round((Date.now() - t0) / 1000) }); last = key; }
    if (s.notSaved || s.recovered) { terminal = true; break; }
    if (!s.running && s.statusComplete && Date.now() - t0 > 60000) { terminal = true; break; }
    await page.waitForTimeout(2000);
  }
  const elapsedS = Math.round((Date.now() - t0) / 1000);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/50a3-artifact-verdict.png`, fullPage: false });

  // Close-up on the contract sentence, wherever it landed.
  const msgRe = /(was NOT saved|Saved your)/;
  const nodes = await page.locator("p, div").filter({ hasText: msgRe }).all();
  if (nodes.length) {
    const el = nodes[nodes.length - 1];
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await el.screenshot({ path: `${OUT}/50a4-contract-message-closeup.png` }).catch((e) => log(`closeup failed: ${e.message}`));
  }

  const finalProbe: any = await page.evaluate(PROBE);
  const posts = await page.evaluate(POSTS);
  writeFileSync(`${OUT}/50a-assertions.json`, JSON.stringify({
    shot: "50a", defect: "D-188", persona: "user_qa_p2", book: BOOK,
    capturedAt: new Date().toISOString(), elapsedS, terminal,
    branch: finalProbe.recovered ? "RECOVERY" : finalProbe.notSaved ? "HONEST-FAILURE" : "NEITHER (silent or clean success)",
    before, finalProbe, agentPosts: posts, samples, pageErrors,
  }, null, 2));
  log(`branch=${finalProbe.recovered ? "RECOVERY" : finalProbe.notSaved ? "HONEST-FAILURE" : "NEITHER"} elapsed=${elapsedS}s terminal=${terminal} pageErrors=${pageErrors.length}`);
  await browser.close();
})();
