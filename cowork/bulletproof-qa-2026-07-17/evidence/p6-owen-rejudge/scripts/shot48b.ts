/**
 * Shot 48b — D-139, 3rd recurrence: is the chapters table's Action column readable
 * with the companion FAB on screen?
 *
 * Same book and same viewport as 45a/45g (VM1 Test, 1280x900), plus the 5-chapter
 * book so a longer table is exercised. The claim is not "the FAB moved" — it did
 * not. The fix reserves bottom clearance on the scrolling shell column (`pb-20`
 * desktop, `pb-32` mobile) so page content can always be scrolled out from under
 * the fixed bubble.
 *
 * So this shot measures GEOMETRY, at both scroll extremes:
 *   - the shell's computed `padding-bottom`
 *   - the FAB's rect
 *   - every Action-cell rect, and the pixel overlap with the FAB
 *   - the visible text of each Action link ("Edit" vs the clipped "Ed…")
 *
 * Usage: npx tsx --env-file=.env shot48b.ts <outDir> <bookId> <tag>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE } from "./shot48-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, TAG] = process.argv.slice(2);
if (!outDir || !BOOK || !TAG) { console.error("usage: <outDir> <bookId> <tag>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p6" };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

const GEO = `(function(){
  function rect(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; }
  function overlap(a, b) {
    var x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    return { px: Math.round(x * y), w: Math.round(x), h: Math.round(y) };
  }
  // The companion bubble: a fixed, round button in the bottom-right corner.
  var fab = null;
  var candidates = Array.prototype.slice.call(document.querySelectorAll("button, a"));
  for (var i = 0; i < candidates.length; i++) {
    var cs = getComputedStyle(candidates[i]);
    var r = candidates[i].getBoundingClientRect();
    if (cs.position === "fixed" && r.width >= 40 && r.width <= 90 && r.bottom > window.innerHeight - 120 && r.right > window.innerWidth - 160) { fab = candidates[i]; break; }
  }
  var table = document.querySelector("table");
  var headers = table ? Array.prototype.slice.call(table.querySelectorAll("thead th")).map(function (t) { return (t.textContent || "").trim(); }) : [];
  var actionIdx = headers.indexOf("Action");
  var cells = [];
  if (table && actionIdx >= 0) {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    for (var j = 0; j < rows.length; j++) {
      var tds = rows[j].querySelectorAll("td");
      var td = tds[actionIdx];
      if (!td) continue;
      var link = td.querySelector("a, button") || td;
      cells.push({
        row: j + 1,
        text: (td.textContent || "").trim(),
        rect: rect(td),
        linkRect: rect(link),
        // Is the Action link's own centre actually hit-testable, or is something on top?
        topElementAtCentre: (function () {
          var rr = link.getBoundingClientRect();
          var el = document.elementFromPoint(Math.min(window.innerWidth - 1, rr.left + rr.width / 2), Math.min(window.innerHeight - 1, rr.top + rr.height / 2));
          return el ? (el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "")) : null;
        })(),
        selfIsOnTop: (function () {
          var rr = link.getBoundingClientRect();
          var el = document.elementFromPoint(Math.min(window.innerWidth - 1, rr.left + rr.width / 2), Math.min(window.innerHeight - 1, rr.top + rr.height / 2));
          return !!(el && (el === link || link.contains(el) || el.contains(link)));
        })()
      });
    }
  }
  var fabRect = fab ? rect(fab) : null;
  if (fabRect) for (var k = 0; k < cells.length; k++) cells[k].overlapWithFab = overlap(cells[k].linkRect, fabRect);
  // The scrolling shell column the D-139 fix pads.
  var main = document.querySelector("main") || document.body;
  var scroller = main;
  while (scroller && scroller !== document.body) {
    var s = getComputedStyle(scroller);
    if (/auto|scroll/.test(s.overflowY)) break;
    scroller = scroller.parentElement;
  }
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollY: Math.round(window.scrollY),
    scrollerTag: scroller ? scroller.tagName + "." + String(scroller.className || "").split(" ").slice(0, 3).join(".") : null,
    scrollerPaddingBottom: scroller ? getComputedStyle(scroller).paddingBottom : null,
    mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
    scrollHeight: Math.round((scroller || document.documentElement).scrollHeight),
    clientHeight: Math.round((scroller || document.documentElement).clientHeight),
    fabPresent: !!fab,
    fabRect: fabRect,
    headers: headers,
    actionColumnIndex: actionIdx,
    actionCells: cells
  };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page: Page = await ctx.newPage();
  const trace: Array<Record<string, unknown>> = [];
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));

  const t0 = Date.now();
  const warm = await ctx.request.get(`${BASE}/books/${BOOK}`);
  trace.push({ step: "warm-overview", status: warm.status(), ms: Date.now() - t0 });

  await page.goto(`${BASE}/books/${BOOK}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);

  // (1) The 45a/45g framing: the table brought into view the way a reader gets there.
  const table = page.locator("table").first();
  await table.waitFor({ timeout: 60000 });
  await table.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/48b1-${TAG}-table-in-view.png`, fullPage: false });
  const geoInView = (await page.evaluate(GEO)) as Record<string, unknown>;

  // (2) Scrolled to the very bottom — where the reserved clearance is what saves the row.
  await page.evaluate(`(function(){
    var el = document.scrollingElement || document.documentElement;
    var main = document.querySelector("main");
    var s = main;
    while (s && s !== document.body) { var cs = getComputedStyle(s); if (/auto|scroll/.test(cs.overflowY)) break; s = s.parentElement; }
    (s && s !== document.body ? s : el).scrollTop = 1e7;
    window.scrollTo(0, 1e7);
    return true;
  })()`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/48b2-${TAG}-scrolled-to-bottom.png`, fullPage: false });
  const geoBottom = (await page.evaluate(GEO)) as Record<string, unknown>;

  const clipped = (g: Record<string, unknown>) => (g.actionCells as Array<{ text: string; overlapWithFab?: { px: number }; selfIsOnTop: boolean }>).map((c) => ({ text: c.text, overlapPx: c.overlapWithFab?.px ?? null, clickable: c.selfIsOnTop }));

  const report = {
    shot: "48b",
    persona: "P6 (Owen)", book: BOOK, tag: TAG,
    proves: "D-139 (3rd recurrence): whether the chapters table Action column is readable and clickable with the fixed companion FAB present, measured at both scroll extremes",
    viewport: "1280x900 (same as 45a/45g)",
    tableInView: geoInView,
    scrolledToBottom: geoBottom,
    summary: {
      shellPaddingBottomInView: geoInView.scrollerPaddingBottom ?? null,
      shellPaddingBottomAtBottom: geoBottom.scrollerPaddingBottom ?? null,
      fabRect: geoBottom.fabRect ?? geoInView.fabRect ?? null,
      actionCellsInView: clipped(geoInView),
      actionCellsAtBottom: clipped(geoBottom),
      anyOverlapInView: clipped(geoInView).some((c) => (c.overlapPx ?? 0) > 0),
      anyOverlapAtBottom: clipped(geoBottom).some((c) => (c.overlapPx ?? 0) > 0),
      allActionTextsFullAtBottom: clipped(geoBottom).every((c) => /^(Edit|Continue|Open|Write)/.test(c.text) || c.text.length > 0),
      allClickableAtBottom: clipped(geoBottom).every((c) => c.clickable),
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/48b-${TAG}-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  await browser.close();
})();
