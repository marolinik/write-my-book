/**
 * Shot 48c — D-181 / D-182 in pixels on Owen's own money surface, and D-180 as-is.
 *
 *   D-181: the green card above the figure used to be headlined "Your Key
 *          Savings" while the figure is SPEND. It should now read
 *          "Your AI Spend — Your Keys" with a description that names the number.
 *   D-182: writer-facing copy uses real em dashes, not ` - `.
 *   D-180: the estimate-vs-actual banner is NOT fixed in that wave — whatever it
 *          says today is captured and disclosed verbatim rather than cropped out.
 *
 * Also re-shoots the Usage-by-Model fold (the 45i surface) so the folded row and
 * the named slots behind it are legible in the same frame.
 *
 * Usage: npx tsx --env-file=.env shot48c.ts <outDir>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE } from "./shot48-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p6" };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

const COPY_STATE = `(function(){
  var body = document.body.innerText;
  function block(label, len) {
    var i = body.indexOf(label);
    return i < 0 ? null : body.slice(i, i + len);
  }
  // Hyphen-as-dash offenders in writer-facing copy (D-182). Excludes ranges
  // like "20-40s" and hyphenated words: only ` - ` with spaces both sides.
  var hyphenDashes = (body.match(/[^\\n]{0,40} - [^\\n]{0,40}/g) || []);
  return {
    spendCard: block("Your AI Spend", 320),
    savingsHeadlineStillPresent: /Your Key Savings/.test(body),
    estimateBanner: block("Cost estimates may be inaccurate", 300),
    byokBlock: block("BYOK", 300),
    usageByModel: block("Usage by Model", 700),
    hyphenDashes: hyphenDashes,
    emDashCount: (body.match(/\\u2014/g) || []).length
  };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];
  const t0 = Date.now();
  const usage = await (await api.get(`${BASE}/api/usage`)).json();
  trace.push({ step: "usage-api", ms: Date.now() - t0 });

  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));
  await page.goto(`${BASE}/settings/billing`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(10000);

  const spend = page.getByText(/Your AI Spend/).first();
  if ((await spend.count()) > 0) { await spend.scrollIntoViewIfNeeded(); await page.waitForTimeout(1000); }
  await page.screenshot({ path: `${outDir}/48c1-spend-card.png`, fullPage: false });

  const banner = page.getByText(/Cost estimates may be inaccurate/).first();
  if ((await banner.count()) > 0) { await banner.scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await page.screenshot({ path: `${outDir}/48c2-estimate-banner-as-is.png`, fullPage: false }); }

  const byModel = page.getByText("Usage by Model", { exact: true }).first();
  if ((await byModel.count()) > 0) { await byModel.scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await page.screenshot({ path: `${outDir}/48c3-usage-by-model-fold.png`, fullPage: false }); }

  await page.screenshot({ path: `${outDir}/48c-billing-full.png`, fullPage: true });
  const copy = (await page.evaluate(COPY_STATE)) as {
    spendCard: string | null; savingsHeadlineStillPresent: boolean; estimateBanner: string | null;
    byokBlock: string | null; usageByModel: string | null; hyphenDashes: string[]; emDashCount: number;
  };

  const report = {
    shot: "48c",
    persona: "P6 (Owen)",
    proves: "D-181 spend card headline/description name the number; D-182 em dashes in writer copy; D-180 estimator banner captured as-is (not fixed); usage-by-model fold legible",
    usageApi: { total: usage.total ?? null, byKeySource: usage.byKeySource ?? null, byModel: usage.byModel ?? null },
    copy,
    verdict: {
      spendHeadlinePresent: /Your AI Spend — Your Keys/.test(copy.spendCard ?? ""),
      headlineUsesEmDash: /Your AI Spend — Your Keys/.test(copy.spendCard ?? ""),
      descriptionNamesTheNumber: /What you paid your AI providers directly/.test(copy.spendCard ?? ""),
      oldSavingsHeadlineGone: copy.savingsHeadlineStillPresent === false,
      amountCarriesItsOwnLabel: /Total spent \(last 30 days\)/.test(copy.spendCard ?? ""),
      noMarkupClaimIsAboutRate: /no platform markup applied/.test(copy.spendCard ?? ""),
      emDashCount: copy.emDashCount,
      spacedHyphenOffenders: copy.hyphenDashes,
      estimateBannerStillPresent: !!copy.estimateBanner,
      estimateBannerText: copy.estimateBanner,
      usageByModelFoldPresent: /Usage by Model/.test(copy.usageByModel ?? ""),
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/48c-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log("--- usage totals:", JSON.stringify(usage.total ?? null));
  await browser.close();
})();
