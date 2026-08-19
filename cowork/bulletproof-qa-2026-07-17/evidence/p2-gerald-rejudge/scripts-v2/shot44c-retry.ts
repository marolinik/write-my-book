/**
 * Shots 44c / 44c2 — RETRY leg (one retry, disclosed).
 * The first pass screenshotted the Version History panel while it still read
 * "Loading versions..." (1.5 s settle was too short). This re-opens the SAME
 * fixture chapter — whose conflict-backup version v4 already exists from the
 * 44a-c run — waits for the list to render, and views the backup version.
 *
 * Usage: npx tsx --env-file=.env shot44c-retry.ts <outDir> <bookId> <chapterId> <backupVersion>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const [outDir, bookId, chapterId, backupVersionArg] = process.argv.slice(2);
if (!outDir || !bookId || !chapterId) { console.error("usage: <outDir> <bookId> <chapterId> <backupVersion>"); process.exit(1); }
const backupVersion = Number(backupVersionArg);
const HIDE = "nextjs-portal{display:none !important}";
const log: string[] = [];
const say = (m: string) => { const l = `[${new Date().toISOString()}] ${m}`; log.push(l); console.log(l); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/books/${bookId}/chapters/${chapterId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: "Version History" }).click();
  // Wait for the real list: the "vN" monospace rows.
  await page.waitForFunction(() => {
    const nodes = Array.from(document.querySelectorAll("span.font-mono"));
    return nodes.filter((n) => /^v\d+$/.test((n as HTMLElement).innerText.trim())).length > 0;
  }, undefined, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44c-version-history-after-load-theirs.png`, fullPage: false });
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("span.font-mono"))
      .map((n) => (n as HTMLElement).innerText.trim())
      .filter((t) => /^v\d+$/.test(t))
  );
  say(`version rows rendered: ${rows.join(", ")}`);

  // View the conflict-backup version.
  const rowLocator = page.locator("span.font-mono", { hasText: new RegExp(`^v${backupVersion}$`) }).first();
  const container = rowLocator.locator("xpath=ancestor::div[contains(@class,'group')][1]");
  await container.hover();
  await page.waitForTimeout(400);
  await container.locator('[title="View version"]').click();
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const dialogText = await page.getByRole("dialog").first().innerText().catch(() => "");
  await page.screenshot({ path: `${outDir}/44c2-conflict-backup-version-viewed.png`, fullPage: false });
  say(`viewer dialog contains the discarded words = ${dialogText.includes("does not intend to lose")}`);

  writeFileSync(`${outDir}/44c-retry-assertions.json`, JSON.stringify({
    shot: "44c/44c2 (retry leg)",
    capturedAt: new Date().toISOString(),
    bookId, chapterId, backupVersion,
    versionRowsRendered: rows,
    viewer_dialog_contains_discarded_words: dialogText.includes("does not intend to lose"),
    viewerDialogTextVerbatim: dialogText,
    log,
  }, null, 2), "utf8");
  await browser.close();
})();
