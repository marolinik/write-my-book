/**
 * Shot 45f — the BYOK usage surface re-shot after this wave's real spend, and
 * the D-162 pixel context: Usage by Agent / Usage by Model now carry today's
 * Anthropic-Opus line-edit, the discuss turn (D-172) and the substituted
 * ghost-text row side by side.
 *
 * Usage: npx tsx --env-file=.env shot45f.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
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
  const api = ctx.request;
  const usage = await api.get(BASE + "/api/usage");
  const usageJson = await usage.json();

  const page = await ctx.newPage();
  await page.goto(BASE + "/settings/billing", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(9000);
  const bodyText = await page.evaluate(() => (document.body as HTMLElement).innerText);
  await page.screenshot({ path: outDir + "/45f1-usage-panel.png", fullPage: false });
  await page.screenshot({ path: outDir + "/45f1-usage-panel-full.png", fullPage: true });

  // Scroll the per-agent / per-model panels into view for a second frame.
  const anchor = page.getByText(/Usage by Model|Usage by Agent/).first();
  if ((await anchor.count()) > 0) {
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: outDir + "/45f2-usage-by-agent-model.png", fullPage: false });
  }

  writeFileSync(outDir + "/45f-assertions.json", JSON.stringify({ shot: "45f", usageApi: usageJson, panelText: bodyText, capturedAt: new Date().toISOString() }, null, 2));
  console.log(bodyText.slice(0, 3000));
  await browser.close();
})();
