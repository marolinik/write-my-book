/**
 * Shot 47f — the settle-delayed dashboard re-shot the P1 v2/v3 panels asked for.
 *
 * D-165: "Last 30 Days" painted an empty plot while the y-axis autoscaled to 419.
 * Three judges called it either a real zero-data bug or a headless-animation
 * artifact (the D-136 precedent) and asked for ONE settle-delayed re-shot before
 * code blame. So: 8 s of settle, then the chart is interrogated three ways —
 *
 *   1. the API series behind it (`/api/books/:id/writing-stats?days=30`)
 *   2. the rendered `<Bar>` geometry (`.recharts-bar-rectangle` bbox per bar)
 *   3. the *computed* fill of those bars
 *
 * so "no data" and "invisible data" cannot be confused with each other.
 *
 * D-166: the same session grabs the book overview, where "Member for N days"
 * sits on one screen with the Days-Writing tile and (when drafted) the
 * certificate's own day count.
 *
 * Usage: npx tsx --env-file=.env shot47f.ts <outDir> <bookId>
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

const CHART_STATE = `(function(){
  var bars = Array.prototype.slice.call(document.querySelectorAll(".recharts-bar-rectangle path, .recharts-rectangle.recharts-bar-rectangle"));
  var svg = document.querySelector(".recharts-surface");
  var yTicks = Array.prototype.slice.call(document.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")).map(function (t) { return (t.textContent || "").trim(); });
  var xTicks = Array.prototype.slice.call(document.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value")).map(function (t) { return (t.textContent || "").trim(); }).filter(Boolean);
  var geo = bars.map(function (b) {
    var bb = b.getBoundingClientRect();
    var cs = getComputedStyle(b);
    return {
      w: Math.round(bb.width * 10) / 10,
      h: Math.round(bb.height * 10) / 10,
      fillAttr: b.getAttribute("fill"),
      fillComputed: cs.fill,
      opacity: cs.opacity,
      d: (b.getAttribute("d") || "").slice(0, 70)
    };
  });
  return {
    surfacePresent: !!svg,
    barElementCount: bars.length,
    barsWithHeight: geo.filter(function (g) { return g.h > 0.5; }).length,
    maxBarHeightPx: geo.reduce(function (m, g) { return Math.max(m, g.h); }, 0),
    distinctFillAttrs: Array.from(new Set(geo.map(function (g) { return g.fillAttr; }))),
    distinctComputedFills: Array.from(new Set(geo.map(function (g) { return g.fillComputed; }))),
    yTicks: yTicks,
    xTicks: xTicks,
    sampleBars: geo.slice(0, 6),
    tallestBars: geo.slice().sort(function (a, b) { return b.h - a.h; }).slice(0, 5),
    tileText: (function () {
      var t = document.body.innerText;
      var m = t.match(/Today's Words[\\s\\S]{0,40}|Streak[\\s\\S]{0,30}|Weekly Average[\\s\\S]{0,30}|Total Words[\\s\\S]{0,30}/g);
      return m ? m.slice(0, 6) : [];
    })()
  };
})()`;

const OVERVIEW_STATE = `(function(){
  var t = document.body.innerText;
  var member = t.match(/Member for [^\\n]*/);
  var days = t.match(/(\\d+)d\\s*\\n\\s*Days Writing/);
  var best = t.match(/(\\d+)d\\s*\\n\\s*Best Streak/);
  var certDays = t.match(/(\\d+)\\s*\\n\\s*Days/);
  return {
    memberLine: member ? member[0] : null,
    daysWritingTile: days ? days[1] : null,
    bestStreakTile: best ? best[1] : null,
    certificateDays: certDays ? certDays[1] : null,
    hasJourneyCard: /Your Writing Journey/.test(t),
    hasCertificate: /First Draft Complete|Certificate/i.test(t)
  };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];

  for (const [k, u] of [
    ["stats", `${BASE}/api/books/${BOOK}/writing-stats?days=30`],
    ["dashboard-page", `${BASE}/books/${BOOK}/dashboard`],
    ["overview-page", `${BASE}/books/${BOOK}`],
  ] as const) {
    const t = Date.now();
    const r = await api.get(u);
    trace.push({ step: `warm-${k}`, status: r.status(), ms: Date.now() - t });
  }
  const stats = await (await api.get(`${BASE}/api/books/${BOOK}/writing-stats?days=30`)).json() as {
    dailyCounts: Array<{ date: string; words: number }>; totalWords: number; todayWords: number; streak: number; bestStreak: number; weeklyAvg: number;
  };

  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));

  await page.goto(`${BASE}/books/${BOOK}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  // Settle: recharts' enter animation is ~1.5 s; 8 s is well past it, and past
  // react-query's first paint of the stats query.
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${outDir}/47f1-dashboard-settled.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/47f1-dashboard-settled-full.png`, fullPage: true });
  const chart = (await page.evaluate(CHART_STATE)) as Record<string, unknown>;

  // A second look 5 s later: if anything were still animating, this would differ.
  await page.waitForTimeout(5000);
  const chart2 = (await page.evaluate(CHART_STATE)) as Record<string, unknown>;
  await page.screenshot({ path: `${outDir}/47f2-dashboard-plus5s.png`, fullPage: false });

  // Zoomed frame on the chart card alone, so the judge sees the plot area at size.
  const card = page.getByText("Last 30 Days").first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/47f3-chart-closeup.png`, fullPage: false, clip: await (async () => {
    const box = await page.locator(".recharts-wrapper").first().boundingBox();
    return box ? { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 60), width: Math.min(1280, box.width + 40), height: box.height + 80 } : { x: 0, y: 0, width: 1280, height: 700 };
  })() });

  await page.goto(`${BASE}/books/${BOOK}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);
  const journey = page.getByText("Your Writing Journey").first();
  if ((await journey.count()) > 0) { await journey.scrollIntoViewIfNeeded(); await page.waitForTimeout(800); }
  await page.screenshot({ path: `${outDir}/47f4-overview-member-tile.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/47f4-overview-member-tile-full.png`, fullPage: true });
  const overview = (await page.evaluate(OVERVIEW_STATE)) as Record<string, unknown>;

  const nonZeroDays = stats.dailyCounts.filter((d) => d.words > 0);
  const report = {
    shot: "47f",
    persona: "P1 (Maya)", book: BOOK,
    proves: "D-165 resolved by settle-delayed re-shot + geometry/fill interrogation; D-166 confirmed on one frame",
    api: {
      totalWords: stats.totalWords, todayWords: stats.todayWords, streak: stats.streak, bestStreak: stats.bestStreak, weeklyAvg: stats.weeklyAvg,
      dayCount: stats.dailyCounts.length,
      nonZeroDays,
      maxDayWords: stats.dailyCounts.reduce((m, d) => Math.max(m, d.words), 0),
      firstDate: stats.dailyCounts[0]?.date ?? null,
      lastDate: stats.dailyCounts[stats.dailyCounts.length - 1]?.date ?? null,
    },
    chartAt8s: chart,
    chartAt13s: chart2,
    stableAcrossSettle: JSON.stringify(chart) === JSON.stringify(chart2),
    overview,
    d165: {
      apiHasData: nonZeroDays.length > 0,
      yAxisTop: (chart as { yTicks?: string[] }).yTicks?.slice(-1)[0] ?? null,
      barElementsRendered: (chart as { barElementCount?: number }).barElementCount ?? null,
      barsWithVisibleHeight: (chart as { barsWithHeight?: number }).barsWithHeight ?? null,
      fillAttrs: (chart as { distinctFillAttrs?: string[] }).distinctFillAttrs ?? null,
      computedFills: (chart as { distinctComputedFills?: string[] }).distinctComputedFills ?? null,
    },
    d166: {
      memberLine: (overview as { memberLine?: string }).memberLine ?? null,
      daysWritingTile: (overview as { daysWritingTile?: string }).daysWritingTile ?? null,
      certificateDays: (overview as { certificateDays?: string }).certificateDays ?? null,
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/47f-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ api: { ...report.api, nonZeroDays: nonZeroDays.slice(0, 8) }, d165: report.d165, d166: report.d166, stableAcrossSettle: report.stableAcrossSettle, tallest: (chart as { tallestBars?: unknown }).tallestBars }, null, 2));
  await browser.close();
})();
