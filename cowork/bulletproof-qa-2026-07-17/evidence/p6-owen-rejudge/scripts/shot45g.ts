/**
 * Shot 45g — D-173 in pixels: the post-setup overview no longer solicits the
 * SKIPPED setup step.
 *
 * Re-shoot of 45a against `921cb90`. Asserts, on camera:
 *   - setupComplete === true at capture time (read from the product's own API)
 *   - NO "Recommended: Capture Style" / "Start Setup" solicitation anywhere
 *   - the recommendation card instead carries a chapter-pipeline step
 *   - sidebar still reads "Getting Started ✓ 2/5" with the Setup item checked
 *   - the "Next Step" badge sits on Chapters (Writing), not on Setup/Style
 *
 * Usage: npx tsx --env-file=.env shot45g.ts <outDir>
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

const HIDE = "nextjs-portal{display:none !important}";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: H,
  });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });

  // Ground truth from the product's own API, before any pixel.
  const setRes = await ctx.request.get(`${BASE}/api/books/${BOOK}/settings`);
  const settings = await setRes.json();

  const page = await ctx.newPage();

  // ENV-01 route-warm: first contact compiles the route; capture the second.
  const tWarm = Date.now();
  await page.goto(`${BASE}/books/${BOOK}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const warmMs = Date.now() - tWarm;
  await page.waitForTimeout(4000);
  const tShot = Date.now();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
  const shotLoadMs = Date.now() - tShot;
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(9000); // react-query settle (settings + chapters + documents)

  const dump = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"], [data-sidebar="sidebar"], aside');
    return {
      sidebarText: sidebar ? (sidebar as HTMLElement).innerText : null,
      bodyText: (document.body as HTMLElement).innerText,
    };
  });

  const s = dump.sidebarText ?? "";
  const b = dump.bodyText ?? "";
  const recoMatch =
    b.match(/Recommended[\s\S]{0,180}/) ?? b.match(/Next up[\s\S]{0,180}/) ?? [""];

  const report = {
    shot: "45g",
    supersedes: "45a",
    proves: "D-173 — post-setup overview shows the chapter-pipeline step, not the skipped Capture Style",
    url: page.url(),
    settingsApi: { setupComplete: settings.setupComplete, setupImportSkipped: settings.setupImportSkipped },
    warmMs,
    shotLoadMs,
    sidebarText: s,
    recommendationBlock: recoMatch[0],
    verdict: {
      setupCompleteTrue: settings.setupComplete === true,
      noCaptureStyleRecommendation: !/Capture (My )?Writing Style|Capture Style/i.test(b),
      noStartSetupCta: !/Start Setup/i.test(b),
      recommendsChapterPipeline: /Discuss Chapter|Dev Edit|Line Edit|Beta Read|Publishing Check/i.test(recoMatch[0]),
      gettingStartedTwoOfFive: /Getting Started[\s\S]{0,40}2\/5/.test(s),
      noStyleNextStepBadge: !/Style\s*\n?\s*Next Step/.test(s),
      noSetupNextStepBadge: !/Setup\s*\n?\s*Next Step/.test(s),
      chaptersCarriesNextStep: /Chapters\s*\n?\s*Next Step/.test(s),
    },
    bodyTextHead: b.slice(0, 2500),
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/45g-assertions.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${outDir}/45g-p6-overview-no-solicitation.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/45g-p6-overview-no-solicitation-full.png`, fullPage: true });
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log("--- recommendation ---\n" + recoMatch[0]);
  console.log("--- sidebar ---\n" + s);
  await browser.close();
})();
