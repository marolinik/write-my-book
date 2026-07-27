/**
 * Shots 49a / 49b — D-195 witnessed in pixels: chart colour is theme-aware again.
 *
 * PRE-FIX BASELINE (47g-assertions.json, same book, same probe):
 *   barsLight  fill "rgb(0, 0, 0)"   barsDark  fill "rgb(0, 0, 0)"
 *   fillIdenticalAcrossThemes: true
 * The bars were painted with `hsl(var(--primary))` over an oklch token, i.e. invalid
 * CSS, so `fill` fell back to its initial value (black) in BOTH themes. In dark mode
 * that is black-on-near-black: the chart was there and unreadable.
 *
 * THE DECISIVE, FALSIFIABLE ASSERTION HERE IS A DIFFERENCE:
 *   1. barsLight fill !== barsDark fill  (the fix is theme-awareness, not a nicer black)
 *   2. neither fill is rgb(0, 0, 0)
 *   3. light tracks --primary oklch(0.205 0 0), dark tracks oklch(0.922 0 0)
 * The `--primary` token is read out of the live document in each theme alongside the
 * fill, so the comparison is interpretable rather than a bare pair of rgb triples.
 *
 * Geometry/fill interrogation is copied from shot47g.ts verbatim (BAR_GEO, AXIS_TEXT,
 * the settle loop) so heights and fills are directly comparable to the pre-fix run.
 * recharts' enter animation is rAF-driven and headless Chromium throttles rAF, so we
 * sample only AFTER geometry stops changing (two identical reads >= 3s apart), exactly
 * as 47g did — 47g settled at 3038ms and held to 7599ms.
 *
 * HARNESS NOTE (esbuild keepNames / __name): every in-page snippet is a raw SOURCE
 * STRING, never a function reference.
 *
 * Theme switch: `document.documentElement.classList.add("dark")` — the same class
 * strategy the app's own theme provider uses, and the same mechanism 47g used, so the
 * two runs differ in the build under test and nothing else. DISCLOSED as a scripted
 * class flip rather than a click on the app's theme control.
 *
 * Usage: npx tsx --env-file=.env shot49a.ts <outDir> <bookId>
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

/** Verbatim from shot47g.ts so the numbers line up with the pre-fix capture. */
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

/** The token the fill is supposed to be tracking, read live in whichever theme is on. */
const TOKENS = `(function(){
  var cs = getComputedStyle(document.documentElement);
  return {
    primary: cs.getPropertyValue("--primary").trim(),
    muted: cs.getPropertyValue("--muted").trim(),
    background: cs.getPropertyValue("--background").trim(),
    htmlClass: document.documentElement.className,
    bodyBg: getComputedStyle(document.body).backgroundColor
  };
})()`;

/** Bar fill ATTRIBUTE as authored, next to what the browser computed from it. */
const FILL_ATTR = `(function(){
  var b = document.querySelector(".recharts-bar-rectangle path");
  return b ? { attr: b.getAttribute("fill"), computed: getComputedStyle(b).fill } : null;
})()`;

/** D-195 second half on this surface: the hover cursor's translucent fill. */
const CURSOR_FILL = `(function(){
  var c = document.querySelector(".recharts-tooltip-cursor");
  if (!c) return null;
  return { attr: c.getAttribute("fill"), computed: getComputedStyle(c).fill };
})()`;

const CARD_BG = `(function(){ var w = document.querySelector(".recharts-wrapper"); var c = w; for (var i=0;i<6&&c;i++){ c = c.parentElement; if (c && /rounded/.test(c.className||"")) break; } return c ? getComputedStyle(c).backgroundColor : null; })()`;

const isBlack = (f: string) => /^rgba?\(0,\s*0,\s*0(,\s*1)?\)$/.test(f.trim());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page: Page = await ctx.newPage();
  const trace: Array<Record<string, unknown>> = [];
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));

  await page.goto(`${BASE}/books/${BOOK}/dashboard`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});

  // ---- settle loop, verbatim shape from 47g: wait for geometry to STOP changing.
  const growth: Array<{ atMs: number; heights: number[] }> = [];
  const t0 = Date.now();
  let prev = "";
  let stableSince: number | null = null;
  let settledAtMs: number | null = null;
  while (Date.now() - t0 < 90000) {
    await page.waitForTimeout(1500);
    const geo = (await page.evaluate(BAR_GEO)) as Array<{ h: number; w: number; fill: string }>;
    const key = JSON.stringify(geo.map((g) => g.h));
    growth.push({ atMs: Date.now() - t0, heights: geo.map((g) => g.h) });
    if (geo.length > 0 && key === prev) {
      if (stableSince === null) stableSince = Date.now();
      if (Date.now() - stableSince >= 3000) { settledAtMs = Date.now() - t0; break; }
    } else stableSince = null;
    prev = key;
  }

  const wrapper = page.locator(".recharts-wrapper").first();
  await wrapper.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // ---- LIGHT: sampled after settle
  const sampledLightAtMs = Date.now() - t0;
  const tokensLight = (await page.evaluate(TOKENS)) as Record<string, string>;
  const geoLight = (await page.evaluate(BAR_GEO)) as Array<{ h: number; w: number; fill: string }>;
  const fillAttrLight = (await page.evaluate(FILL_ATTR)) as { attr: string; computed: string } | null;
  const axisText = (await page.evaluate(AXIS_TEXT)) as string[];
  const cardBgLight = (await page.evaluate(CARD_BG)) as string | null;
  await page.screenshot({ path: `${outDir}/49a1-dashboard-light-full.png`, fullPage: false });
  let box = await wrapper.boundingBox();
  if (box) await page.screenshot({ path: `${outDir}/49a2-chart-light-closeup.png`, clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 70), width: Math.min(1280, box.width + 48), height: box.height + 90 } });

  // ---- hover a bar: the second D-195 site on this surface (translucent cursor)
  let cursorLight: { attr: string; computed: string } | null = null;
  let tooltipTextLight = "";
  const firstBar = page.locator(".recharts-bar-rectangle").first();
  if (await firstBar.count()) {
    await firstBar.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    cursorLight = (await page.evaluate(CURSOR_FILL)) as { attr: string; computed: string } | null;
    tooltipTextLight = await page.locator(".recharts-tooltip-wrapper").first().innerText().catch(() => "");
    box = await wrapper.boundingBox();
    if (box) await page.screenshot({ path: `${outDir}/49a3-chart-light-hover-cursor.png`, clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 70), width: Math.min(1280, box.width + 48), height: box.height + 90 } });
    await page.mouse.move(4, 4);
    await page.waitForTimeout(400);
  }

  // ---- DARK
  await page.evaluate(`(function(){ document.documentElement.classList.add("dark"); return true; })()`);
  await page.waitForTimeout(1800);
  const tokensDark = (await page.evaluate(TOKENS)) as Record<string, string>;
  const geoDark = (await page.evaluate(BAR_GEO)) as Array<{ h: number; w: number; fill: string }>;
  const fillAttrDark = (await page.evaluate(FILL_ATTR)) as { attr: string; computed: string } | null;
  const cardBgDark = (await page.evaluate(CARD_BG)) as string | null;
  const sampledDarkAtMs = Date.now() - t0;
  await page.screenshot({ path: `${outDir}/49b1-dashboard-dark-full.png`, fullPage: false });
  const boxDark = await wrapper.boundingBox();
  if (boxDark) await page.screenshot({ path: `${outDir}/49b2-chart-dark-closeup.png`, clip: { x: Math.max(0, boxDark.x - 24), y: Math.max(0, boxDark.y - 70), width: Math.min(1280, boxDark.width + 48), height: boxDark.height + 90 } });

  let cursorDark: { attr: string; computed: string } | null = null;
  if (await firstBar.count()) {
    await firstBar.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    cursorDark = (await page.evaluate(CURSOR_FILL)) as { attr: string; computed: string } | null;
    const b2 = await wrapper.boundingBox();
    if (b2) await page.screenshot({ path: `${outDir}/49b3-chart-dark-hover-cursor.png`, clip: { x: Math.max(0, b2.x - 24), y: Math.max(0, b2.y - 70), width: Math.min(1280, b2.width + 48), height: b2.height + 90 } });
  }

  const fillsLight = Array.from(new Set(geoLight.map((g) => g.fill)));
  const fillsDark = Array.from(new Set(geoDark.map((g) => g.fill)));

  const report = {
    shot: "49a/49b",
    persona: "P1 (Maya)", book: BOOK, build: "ac20626 (D-195 fix)",
    proves: "D-195 closed: dashboard bar fill now resolves the oklch --primary token per theme instead of falling back to black in both",
    preFixBaseline: { source: "47g-assertions.json", barsLightFill: "rgb(0, 0, 0)", barsDarkFill: "rgb(0, 0, 0)", fillIdenticalAcrossThemes: true },
    sampling: { settledAtMs, sampledLightAtMs, sampledDarkAtMs, animationGrowth: growth },
    light: { tokens: tokensLight, bars: geoLight, fillAttr: fillAttrLight, cardBackground: cardBgLight, cursor: cursorLight, tooltipText: tooltipTextLight },
    dark: { tokens: tokensDark, bars: geoDark, fillAttr: fillAttrDark, cardBackground: cardBgDark, cursor: cursorDark },
    axisText,
    verdict: {
      barsRendered: geoLight.length,
      allBarsHaveHeight: geoLight.length > 0 && geoLight.every((g) => g.h > 1),
      heightsStableAtEnd: growth.length > 1 && JSON.stringify(growth[growth.length - 1].heights) === JSON.stringify(growth[growth.length - 2].heights),
      fillsLight, fillsDark,
      // THE assertion: the two themes must differ, and neither may be black.
      fillsDifferAcrossThemes: JSON.stringify(fillsLight) !== JSON.stringify(fillsDark),
      lightFillIsBlack: fillsLight.some(isBlack),
      darkFillIsBlack: fillsDark.some(isBlack),
      neitherFillIsBlack: fillsLight.length > 0 && fillsDark.length > 0 && !fillsLight.some(isBlack) && !fillsDark.some(isBlack),
      fillAttrIsBareToken: fillAttrLight?.attr === "var(--primary)",
      primaryTokenFlipped: tokensLight.primary !== tokensDark.primary,
      cursorFillValidLight: !!(cursorLight && cursorLight.computed && cursorLight.computed !== "none" && !isBlack(cursorLight.computed)),
      axisLabelsRendered: axisText.length,
      pageErrors: trace.length,
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/49ab-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    verdict: report.verdict,
    settledAtMs,
    lightPrimary: tokensLight.primary, darkPrimary: tokensDark.primary,
    lightFill: fillsLight, darkFill: fillsDark,
    fillAttr: fillAttrLight, cursorLight, cursorDark,
    cardBgLight, cardBgDark,
    heights: geoLight.map((g) => g.h),
    axisText: axisText.slice(0, 12),
  }, null, 2));
  await browser.close();
})();
