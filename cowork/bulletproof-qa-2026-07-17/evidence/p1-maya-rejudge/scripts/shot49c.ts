/**
 * Shot 49c — D-195 on the reports analytics tab: the Tooltip that had NO background.
 *
 * PRE-FIX: `contentStyle={{ backgroundColor: "hsl(var(--card))",
 * border: "1px solid hsl(var(--border))" }}`. Both values invalid, so both
 * declarations were dropped entirely and the tooltip rendered as bare text floating
 * over the chart. Post-fix the same object reads `var(--card)` / `var(--border)`.
 * (analytics-tab.tsx, Per-Chapter Beta Scores BarChart.)
 *
 * DISCLOSURE — WHY NOT ON P1's BOOK. P1's book cannot mount any chart on this tab:
 *   - no chapter of it carries a betaScore, so hasBetaScores is false;
 *   - `ANALYSIS_REPORT` documents do not exist for ANY book in the dev DB
 *     (`select ... where type='ANALYSIS_REPORT'` -> 0 rows), so hasAnalysis is false;
 *   - P1 is 100% own-keys, and the Cost sub-tab renders the "100% Your Keys" badge
 *     INSTEAD of the pie, so even the cost chart is absent.
 * peek49c.ts confirmed this in the DOM: Analytics tab selected, `.recharts-wrapper`
 * count 0. The only book in this database that mounts a tooltip-bearing analytics
 * chart is the one below, owned by `user_dev_bypass`. The assertion under test is CSS
 * custom-property resolution, which is identity-independent — but this is TRANSFERRED
 * evidence for P1, not a capture on P1's own surface, and is labelled as such.
 *
 * No persona data is mutated: this book and its beta score already existed.
 *
 * HARNESS NOTES:
 *  - in-page snippets are raw SOURCE STRINGS (esbuild keepNames / __name).
 *  - recharts drives its tooltip off mousemove on the chart surface. `locator.hover()`
 *    did NOT raise a tooltip in shot 49a (cross-checked against 49a3 pixels: no
 *    tooltip, no cursor). Here we scan `page.mouse.move` across the plot area and stop
 *    at the first frame where the tooltip actually has text.
 *  - hit geometry is taken after `scrollIntoView` with an UNCLAMPED rect read (the
 *    shot-48b lesson: never hit-test after scrollTo(0,1e7)).
 *
 * Usage: npx tsx --env-file=.env shot49c.ts <outDir> <bookId> <clerkId>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE } from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, CLERK] = process.argv.slice(2);
if (!outDir || !BOOK || !CLERK) { console.error("usage: <outDir> <bookId> <clerkId>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

/** Unclamped rect of the plot area + the bars inside it. */
const PLOT_GEO = `(function(){
  var w = document.querySelector(".recharts-wrapper");
  if (!w) return null;
  var wr = w.getBoundingClientRect();
  var bars = Array.prototype.slice.call(w.querySelectorAll(".recharts-bar-rectangle path")).map(function (b) {
    var r = b.getBoundingClientRect();
    var cs = getComputedStyle(b);
    return { x: r.x, y: r.y, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
             cx: r.x + r.width / 2, cy: r.y + r.height / 2, fill: cs.fill };
  });
  return { wrapper: { x: wr.x, y: wr.y, w: wr.width, h: wr.height }, bars: bars };
})()`;

/**
 * The tooltip's OWN computed style. `contentStyle` lands on .recharts-default-tooltip;
 * we read both it and the outer wrapper so a null cannot be mistaken for transparency.
 */
const TOOLTIP_STYLE = `(function(){
  var wrap = document.querySelector(".recharts-tooltip-wrapper");
  var inner = document.querySelector(".recharts-default-tooltip");
  var read = function (el) {
    if (!el) return null;
    var cs = getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      borderTopWidth: cs.borderTopWidth,
      borderTopStyle: cs.borderTopStyle,
      borderTopColor: cs.borderTopColor,
      borderRadius: cs.borderRadius,
      color: cs.color,
      inlineStyle: el.getAttribute("style"),
      text: (el.innerText || "").trim()
    };
  };
  return { wrapper: read(wrap), inner: read(inner), wrapperPresent: !!wrap, innerPresent: !!inner };
})()`;

const TOKENS = `(function(){
  var cs = getComputedStyle(document.documentElement);
  return { card: cs.getPropertyValue("--card").trim(), border: cs.getPropertyValue("--border").trim(), htmlClass: document.documentElement.className };
})()`;

const TRANSPARENT = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/;

async function raiseTooltip(page: Page) {
  const geo = (await page.evaluate(PLOT_GEO)) as { wrapper: { x: number; y: number; w: number; h: number }; bars: Array<{ cx: number; cy: number; x: number; y: number; w: number; h: number }> } | null;
  if (!geo || geo.bars.length === 0) return { geo, raisedAt: null as null | { x: number; y: number }, style: null as unknown };
  const targets: Array<{ x: number; y: number }> = [];
  for (const b of geo.bars) {
    targets.push({ x: b.cx, y: b.cy });
    targets.push({ x: b.cx, y: b.y + b.h * 0.25 });
    targets.push({ x: b.cx, y: b.y + b.h * 0.75 });
  }
  // plus a horizontal sweep across the middle of the plot, in case the bar itself is
  // not the hover target recharts listens on
  const mid = geo.wrapper.y + geo.wrapper.h * 0.5;
  for (let f = 0.1; f <= 0.9; f += 0.05) targets.push({ x: geo.wrapper.x + geo.wrapper.w * f, y: mid });

  for (const t of targets) {
    if (t.x < 0 || t.y < 0) continue;
    await page.mouse.move(t.x, t.y, { steps: 4 });
    await page.waitForTimeout(220);
    const style = (await page.evaluate(TOOLTIP_STYLE)) as { inner: { text: string } | null; innerPresent: boolean };
    if (style.innerPresent && style.inner && style.inner.text.length > 0) {
      return { geo, raisedAt: t, style };
    }
  }
  const style = await page.evaluate(TOOLTIP_STYLE);
  return { geo, raisedAt: null, style };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page: Page = await ctx.newPage();
  const trace: Array<Record<string, unknown>> = [];
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));

  await page.goto(`${BASE}/books/${BOOK}/reports`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(3000);

  const analytics = page.getByRole("tab", { name: /^Analytics$/i });
  if (await analytics.count()) { await analytics.first().click(); await page.waitForTimeout(1500); }
  const beta = page.getByRole("tab", { name: /Beta Scores/i });
  const betaTabPresent = (await beta.count()) > 0;
  if (betaTabPresent) { await beta.first().click(); await page.waitForTimeout(1500); }

  // settle recharts' rAF-throttled enter animation before hit-testing
  let prev = "";
  let stableSince: number | null = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(1200);
    const g = (await page.evaluate(PLOT_GEO)) as { bars: Array<{ h: number }> } | null;
    const key = JSON.stringify((g?.bars ?? []).map((b) => b.h));
    if (g && g.bars.length > 0 && key === prev) {
      if (stableSince === null) stableSince = Date.now();
      if (Date.now() - stableSince >= 2400) break;
    } else stableSince = null;
    prev = key;
  }

  const wrapper = page.locator(".recharts-wrapper").first();
  const chartMounted = (await wrapper.count()) > 0;
  if (chartMounted) await wrapper.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(700);

  const tokensLight = (await page.evaluate(TOKENS)) as Record<string, string>;
  await page.screenshot({ path: `${outDir}/49c1-analytics-tab-before-hover.png`, fullPage: false });

  const light = chartMounted ? await raiseTooltip(page) : { geo: null, raisedAt: null, style: null };
  if (light.raisedAt) await page.screenshot({ path: `${outDir}/49c2-tooltip-light.png`, fullPage: false });

  // dark mode: the theme where the pre-fix tooltip was worst (no bg on a dark chart)
  await page.evaluate(`(function(){ document.documentElement.classList.add("dark"); return true; })()`);
  await page.waitForTimeout(1500);
  const tokensDark = (await page.evaluate(TOKENS)) as Record<string, string>;
  await page.mouse.move(4, 4);
  await page.waitForTimeout(400);
  const dark = chartMounted ? await raiseTooltip(page) : { geo: null, raisedAt: null, style: null };
  if (dark.raisedAt) await page.screenshot({ path: `${outDir}/49c3-tooltip-dark.png`, fullPage: false });

  const ls = (light.style as { inner: Record<string, string> | null } | null)?.inner ?? null;
  const ds = (dark.style as { inner: Record<string, string> | null } | null)?.inner ?? null;

  const report = {
    shot: "49c",
    persona: "P1 (Maya) — TRANSFERRED: captured on the only book in the dev DB that mounts an analytics chart",
    identityUsed: CLERK, book: BOOK, build: "ac20626 (D-195 fix)",
    proves: "the reports analytics Tooltip contentStyle now resolves to a real background + border instead of dropping both declarations as invalid CSS",
    preFix: { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", effect: "both declarations invalid -> dropped -> tooltip was unbacked text over the chart" },
    whyNotOnP1sBook: {
      hasBetaScores: false,
      analysisReportDocumentsInWholeDb: 0,
      costPieSuppressedBy: "allUserKeys -> renders the '100% Your Keys' badge instead of the PieChart",
      peekEvidence: "peek49c.ts: Analytics tab aria-selected=true, .recharts-wrapper count 0",
    },
    betaTabPresent, chartMounted,
    tokens: { light: tokensLight, dark: tokensDark },
    light: { raisedAt: light.raisedAt, style: light.style, bars: (light.geo as { bars: unknown } | null)?.bars ?? null },
    dark: { raisedAt: dark.raisedAt, style: dark.style },
    verdict: {
      chartMounted,
      tooltipRaisedLight: !!light.raisedAt,
      tooltipRaisedDark: !!dark.raisedAt,
      lightBackground: ls?.backgroundColor ?? null,
      darkBackground: ds?.backgroundColor ?? null,
      lightBackgroundIsRealColour: !!(ls && ls.backgroundColor && !TRANSPARENT.test(ls.backgroundColor.trim())),
      darkBackgroundIsRealColour: !!(ds && ds.backgroundColor && !TRANSPARENT.test(ds.backgroundColor.trim())),
      backgroundDiffersAcrossThemes: !!(ls && ds && ls.backgroundColor !== ds.backgroundColor),
      lightBorder: ls ? `${ls.borderTopWidth} ${ls.borderTopStyle} ${ls.borderTopColor}` : null,
      darkBorder: ds ? `${ds.borderTopWidth} ${ds.borderTopStyle} ${ds.borderTopColor}` : null,
      lightBorderRendered: !!(ls && ls.borderTopStyle === "solid" && parseFloat(ls.borderTopWidth) > 0),
      inlineStyleLight: ls?.inlineStyle ?? null,
      tooltipTextLight: ls?.text ?? null,
      pageErrors: trace.length,
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/49c-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.verdict, null, 2));
  await browser.close();
})();
