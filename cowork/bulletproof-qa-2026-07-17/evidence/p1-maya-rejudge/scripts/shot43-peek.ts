/**
 * Shot 43 peek — render-only screenshot of one finding card (no clicks, no LLM spend).
 * Usage: npx tsx --env-file=.env shot43-peek.ts <findingId> <outDir> <shotBaseName> [--path <urlPath>]
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const findingId = process.argv[2];
const outDir = process.argv[3];
const shotName = process.argv[4];
const pi = process.argv.indexOf("--path");
const urlPath = pi >= 0 ? process.argv[pi + 1] : `/books/${BOOK}/editorial`;
if (!findingId || !outDir || !shotName) { console.error("usage: <findingId> <outDir> <shotBaseName> [--path <p>]"); process.exit(1); }

const HIDE_DEVTOOLS = "nextjs-portal{display:none !important}";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE_DEVTOOLS }).catch(() => {});
  const card = page.locator(`#finding-card-${findingId}`);
  await card.waitFor({ state: "visible", timeout: 120000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: HIDE_DEVTOOLS }).catch(() => {});
  const text = await page.evaluate(`document.getElementById("finding-card-${findingId}").innerText`);
  await card.screenshot({ path: `${outDir}/${shotName}.png` });
  await page.screenshot({ path: `${outDir}/${shotName}-full.png`, fullPage: true });
  writeFileSync(`${outDir}/${shotName}-cardtext.txt`, String(text));
  console.log(text);
  await browser.close();
})();
