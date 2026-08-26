/**
 * 50c — D-194 chapter count, ON CAMERA as P2 Gerald.
 *
 * Pre-fix: `POST /api/books` created the write-first placeholder Chapter 1 but
 * left `books.chapter_count` at its 0 default, so every in-product book started
 * off by one and every later +/-1 delta rode the wrong base. The dashboard
 * "Total chapters" tile is the writer-facing surface that reads the STORED
 * column (`_sum.chapterCount`) — book cards and the setup wizard read a live
 * `_count`, so they never showed the drift.
 *
 * Proof shape: dashboard tile BEFORE, create a book through the real form,
 * dashboard tile AFTER. Delta must be exactly +1, and the new book must hold
 * exactly one chapter row (no phantom extra chapter).
 *
 * HARNESS NOTE: in-page snippets are raw SOURCE STRINGS (esbuild keepNames).
 *
 * Usage: npx tsx --env-file=.env shot50c.ts
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const OUT = "../shots";
const HIDE = "nextjs-portal{display:none !important}";
const NAME = `QA-50C-${Date.now()}`;

const INIT = `
(function () {
  var style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none !important}";
  document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });
  window.__c = { posts: [] };
  var origFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var input = args[0]; var init = args[1] || {};
    var url = (typeof input === "string" ? input : (input && input.url) || "");
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var p = origFetch.apply(this, args);
    if (!(method === "POST" && /\\/api\\/books(\\?|$)/.test(url))) return p;
    return p.then(function (res) {
      res.clone().text().then(function (txt) {
        window.__c.posts.push({ url: url, status: res.status, body: txt.slice(0, 700) });
      }).catch(function () {});
      return res;
    });
  };
})();
`;

/** Read the dashboard "Total chapters" tile by its own card, not by index. */
const TILE = `(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-slot="card"], .rounded-xl'));
  var hit = null;
  for (var i = 0; i < cards.length; i++) {
    var t = (cards[i].innerText || "").trim();
    if (/^Total chapters/i.test(t) || /Total chapters/i.test(t.split("\\n")[0] || "")) { hit = cards[i]; break; }
  }
  var num = null;
  if (hit) {
    var m = (hit.innerText || "").match(/(\\d[\\d,]*)/);
    if (m) num = Number(m[1].replace(/,/g, ""));
  }
  var r = hit ? hit.getBoundingClientRect() : null;
  return {
    found: !!hit,
    text: hit ? (hit.innerText || "").trim() : null,
    value: num,
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
  };
})()`;

function log(m: string) { console.log(`[50c] ${m}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));

  // BEFORE
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);
  const before: any = await page.evaluate(TILE);
  log(`before tile: found=${before.found} value=${before.value}`);
  await page.screenshot({ path: `${OUT}/50c1-dashboard-before.png`, fullPage: false });

  // CREATE through the real form
  await page.goto(`${BASE}/books/new`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.locator("#name").fill(NAME);
  await page.screenshot({ path: `${OUT}/50c2-new-book-form.png`, fullPage: false });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(9000);
  const afterCreateUrl = page.url();
  const posts: any = await page.evaluate(`(function(){ return window.__c ? window.__c.posts : null; })()`);
  log(`post-create url: ${afterCreateUrl}`);
  await page.screenshot({ path: `${OUT}/50c3-after-create.png`, fullPage: false });

  let bookId: string | null = null;
  try { bookId = JSON.parse(posts?.[0]?.body ?? "{}").id ?? null; } catch { /* keep null */ }

  // AFTER — fresh load so the tile is server-rendered again
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);
  const after: any = await page.evaluate(TILE);
  log(`after tile: value=${after.value} (delta ${after.value != null && before.value != null ? after.value - before.value : "?"})`);
  await page.screenshot({ path: `${OUT}/50c4-dashboard-after.png`, fullPage: false });
  if (after.rect) {
    await page.screenshot({
      path: `${OUT}/50c5-total-chapters-tile.png`,
      clip: { x: after.rect.x, y: after.rect.y, width: after.rect.w, height: after.rect.h },
    }).catch((e) => log(`tile clip failed: ${e.message}`));
  }

  writeFileSync(`${OUT}/50c-assertions.json`, JSON.stringify({
    shot: "50c", defect: "D-194", persona: "user_qa_p2",
    capturedAt: new Date().toISOString(), bookName: NAME, bookId,
    createPost: posts, afterCreateUrl,
    tileBefore: before, tileAfter: after,
    delta: after.value != null && before.value != null ? after.value - before.value : null,
    deltaIsExactlyOne: after.value != null && before.value != null && after.value - before.value === 1,
    pageErrors,
  }, null, 2));
  log(`bookId=${bookId} name=${NAME}`);
  await browser.close();
})();
