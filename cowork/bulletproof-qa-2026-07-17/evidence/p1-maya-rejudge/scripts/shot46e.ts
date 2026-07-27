/**
 * Shot 46e — the streamed discuss spend, on the writer's own billing surface.
 *
 * D-172 was closed for the BLOCKING path (P6 45d). This is the same proof for the
 * STREAMED path: three delivered turns, three `discuss` usage rows, and a Discuss
 * agent row with real non-zero money in P1's panel — plus the registry model id
 * from `/api/usage` so the D-44 slot id is verifiable, not inferred.
 *
 * Usage: npx tsx --env-file=.env shot46e.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const usage = await (await ctx.request.get(`${BASE}/api/usage`)).json();

  const page = await ctx.newPage();
  await page.goto(`${BASE}/settings/billing`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(10000);
  const bodyText = await page.evaluate(`(function(){ return document.body.innerText; })()`) as string;
  const anchor = page.getByText(/Usage by Agent/).first();
  if ((await anchor.count()) > 0) { await anchor.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500); }
  await page.screenshot({ path: `${outDir}/46e-usage-discuss-row.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/46e-usage-discuss-row-full.png`, fullPage: true });

  const discussAgent = (usage.byAgent ?? {})["discuss"] ?? null;
  const report = {
    shot: "46e",
    proves: "one discuss usage row per delivered streamed turn, registry model id, real money on the panel",
    usageApi: { byAgentDiscuss: discussAgent, byModel: usage.byModel ?? null, totals: usage.totals ?? usage.summary ?? null },
    panelDiscussLine: (bodyText.match(/Discuss[\s\S]{0,120}/) ?? [""])[0],
    verdict: {
      discussAgentRowExists: !!discussAgent,
      threeSessions: (discussAgent?.sessionCount ?? discussAgent?.sessions ?? null) === 3,
      nonZeroSpend: (discussAgent?.costEstimate ?? 0) > 0,
      registryModelIdPresent: Object.keys(usage.byModel ?? {}).some((k) => k.includes("qwen36")),
      panelShowsDiscuss: /Discuss/.test(bodyText),
    },
    panelText: bodyText,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/46e-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, byAgentDiscuss: discussAgent, panelDiscussLine: report.panelDiscussLine }, null, 2));
  await browser.close();
})();
