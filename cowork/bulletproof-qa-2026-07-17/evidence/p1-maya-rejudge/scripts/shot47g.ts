/**
 * Shot 47g — D-165 closed: the chart, photographed once its own animation has
 * actually finished, plus the reason the earlier frames were empty.
 *
 * 47f showed the tallest bar at 117 px eight seconds in and 236 px thirteen
 * seconds in: recharts' enter animation is rAF-driven, and headless Chromium
 * throttles rAF hard, so the "empty plot" in the 42-series was the first frame of
 * a very slow animation — the D-136 family, not a data bug. This shot proves it by
 * waiting for GEOMETRY TO STOP CHANGING (two identical reads 3 s apart) instead of
 * waiting a fixed time, then shooting.
 *
 * It also photographs the same chart in dark mode, because the bars' `fill` is the
 * pre-Tailwind-v4 `hsl(var(--primary))` idiom: `--primary` is now `oklch(...)`, so
 * the value is invalid and every bar computes to plain black in BOTH themes.
 *
 * Usage: npx tsx --env-file=.env shot47g.ts <outDir> <bookId>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE } from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK] = process.argv.slice(2);
if (!outDir || !BOOK) { console.error("usage: <outDir> <bookId>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

const BAR_GEO = `(function(){
  var bars = Array.prototype.slice.call(document.querySelectorAll(".recharts-bar-rectangle path"));
  return bars.map(function (b) {
    var bb = b.getBoundingClientRect();
    var cs = getComputedStyle(b);
    return { h: Math.round(bb.height * 10) / 10, w: Math.round(bb.width * 10) / 10, fill: cs.fill };
  });
})()`;

const AXIS_TEXT = `(function(){
  var texts = Array.prototype.slice.call(document.querySelectorAll(".recharts-surface text")).map(function (t) { return (t.textContent || "").trim(); }).filter(Boolean);
  return texts;
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page: Page = await ctx.newPage();
  const trace: Array<Record<string, unknown>> = [];
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));

  await page.goto(`${BASE}/books/${BOOK}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});

  const growth: Array<{ atMs: number; heights: number[] }> = [];
  const t0 = Date.now();
  let prev = "";
  let stableSince: number | null = null;
  while (Date.now() - t0 < 90000) {
    await page.waitForTimeout(1500);
    const geo = (await page.evaluate(BAR_GEO)) as Array<{ h: number; w: number; fill: string }>;
    const key = JSON.stringify(geo.map((g) => g.h));
    growth.push({ atMs: Date.now() - t0, heights: geo.map((g) => g.h) });
    if (geo.length > 0 && key === prev) {
      if (stableSince === null) stableSince = Date.now();
      if (Date.now() - stableSince >= 3000) break;
    } else stableSince = null;
    prev = key;
  }

  const wrapper = page.locator(".recharts-wrapper").first();
  await wrapper.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/47g1-chart-animation-complete.png`, fullPage: false });
  const box = await wrapper.boundingBox();
  if (box) await page.screenshot({ path: `${outDir}/47g2-chart-closeup.png`, clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 70), width: Math.min(1280, box.width + 48), height: box.height + 90 } });
  const geoLight = (await page.evaluate(BAR_GEO)) as Array<{ h: number; w: number; fill: string }>;
  const axisText = (await page.evaluate(AXIS_TEXT)) as string[];

  // Dark mode: same invalid fill, same black bars — on a dark card.
  await page.evaluate(`(function(){ document.documentElement.classList.add("dark"); return true; })()`);
  await page.waitForTimeout(1500);
  const geoDark = (await page.evaluate(BAR_GEO)) as Array<{ h: number; w: number; fill: string }>;
  const boxDark = await wrapper.boundingBox();
  if (boxDark) await page.screenshot({ path: `${outDir}/47g3-chart-dark-mode.png`, clip: { x: Math.max(0, boxDark.x - 24), y: Math.max(0, boxDark.y - 70), width: Math.min(1280, boxDark.width + 48), height: boxDark.height + 90 } });
  const cardBg = (await page.evaluate(`(function(){ var w = document.querySelector(".recharts-wrapper"); var c = w; for (var i=0;i<6&&c;i++){ c = c.parentElement; if (c && /rounded/.test(c.className||"")) break; } return c ? getComputedStyle(c).backgroundColor : null; })()`)) as string | null;

  const report = {
    shot: "47g",
    persona: "P1 (Maya)", book: BOOK,
    proves: "D-165 was a headless rAF-throttled recharts enter animation (D-136 family), not missing data; bars reach full height and stay; chart fill idiom is stale (candidate)",
    animationGrowth: growth,
    settledAfterMs: growth.length ? growth[growth.length - 1].atMs : null,
    barsLight: geoLight,
    barsDark: geoDark,
    axisText,
    darkCardBackground: cardBg,
    verdict: {
      barsRendered: geoLight.length,
      allBarsHaveHeight: geoLight.length > 0 && geoLight.every((g) => g.h > 1),
      heightsStableAtEnd: growth.length > 1 && JSON.stringify(growth[growth.length - 1].heights) === JSON.stringify(growth[growth.length - 2].heights),
      grewOverTime: growth.length > 1 && Math.max(...growth[growth.length - 1].heights, 0) > Math.max(...growth[0].heights, 0),
      fillsLight: Array.from(new Set(geoLight.map((g) => g.fill))),
      fillsDark: Array.from(new Set(geoDark.map((g) => g.fill))),
      fillIdenticalAcrossThemes: JSON.stringify(Array.from(new Set(geoLight.map((g) => g.fill)))) === JSON.stringify(Array.from(new Set(geoDark.map((g) => g.fill)))),
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/47g-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, settledAfterMs: report.settledAfterMs, growth: growth.map((g) => `${g.atMs}ms:${g.heights.join("/")}`), axisText: axisText.slice(0, 12), darkCardBackground: cardBg }, null, 2));
  await browser.close();
})();
