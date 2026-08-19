/**
 * Shot 45a — D-160 proof: setup completion is visible in the chrome.
 *
 * Book "VM1 Test" (8632ba0c) already carries setupComplete=true from the
 * 41-series walk. Asserts, on camera:
 *   - sidebar "Getting Started" badge = check + 2/5 (truthful fraction)
 *   - Setup nav item carries a check, NOT a "Next Step" badge
 *   - Style nav item carries NO "Next Step" badge
 *   - overview shows no "Start Setup" / "Recommended: Capture Style" solicitation
 *   - the recommendation is a chapter-pipeline one instead
 *
 * Usage: npx tsx --env-file=.env shot45a.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "8632ba0c-f05b-4fd5-9581-3790a0f2c675";
const CLERK = "user_qa_p6";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }

const HIDE = `nextjs-portal{display:none !important}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK },
  });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();

  // ENV-01 route-warm: first contact compiles the route; capture the second.
  await page.goto(`${BASE}/books/${BOOK}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  // let react-query settle (settings + chapters + documents)
  await page.waitForTimeout(9000);

  const dump = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"], [data-sidebar="sidebar"], aside');
    const bodyText = (document.body as HTMLElement).innerText;
    return {
      sidebarText: sidebar ? (sidebar as HTMLElement).innerText : null,
      bodyText,
    };
  });

  const s = dump.sidebarText ?? "";
  const b = dump.bodyText ?? "";
  const report = {
    shot: "45a",
    url: page.url(),
    sidebarText: s,
    verdict: {
      gettingStartedTwoOfFive: /Getting Started[\s\S]{0,40}2\/5/.test(s),
      noStyleNextStepBadge: !/Style\s*\n?\s*Next Step/.test(s),
      noNextStepInPrepare: !/Setup\s*\n?\s*Next Step/.test(s),
      noStartSetupCta: !/Start Setup/i.test(b),
      noCaptureStyleRecommendation: !/Capture (My )?Writing Style|Capture Style/i.test(b),
      recommendationText: (b.match(/Recommended Next[\s\S]{0,200}/) ?? b.match(/Next up[\s\S]{0,200}/) ?? [""])[0],
    },
    bodyTextHead: b.slice(0, 2500),
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/45a-assertions.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${outDir}/45a-p6-setup-complete-chrome.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/45a-p6-setup-complete-chrome-full.png`, fullPage: true });
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log("--- sidebar ---\n" + s);
  await browser.close();
})();
