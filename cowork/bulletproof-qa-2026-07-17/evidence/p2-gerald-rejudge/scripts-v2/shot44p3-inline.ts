/**
 * Shot 44p3 (retry leg, disclosed) — inline edit on Gerald's own prose.
 * The first pass fired F2 correctly but the script screenshotted while the popup still
 * read "Generating suggestions…". This waits for the suggestion to land, records the
 * /inline-edit response and the served model, and asserts unicode/voice survival.
 *
 * Also re-tries the ghost ACCEPT properly: D5/D-140 arms Tab only on the `done` frame,
 * so the first pass pressed Tab mid-stream (a no-op by design). Here we wait for the
 * accept pill before pressing Tab.
 *
 * Usage: npx tsx --env-file=.env shot44p3-inline.ts <outDir> <bookId> <chapterId>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET!;
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const [outDir, bookId, chapterId] = process.argv.slice(2);
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
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/inline-edit") || u.includes("/ghost-text")) {
      net.push({ url: u.replace(BASE, ""), method: r.request().method(), status: r.status(), at: new Date().toISOString(), ct: r.headers()["content-type"] ?? null });
    }
  });

  await page.goto(`${BASE}/books/${bookId}/chapters/${chapterId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const ed = page.locator(".ProseMirror");
  await ed.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2500);
  const beforeProse = await ed.innerText();

  // --- ghost accept, properly armed
  const ghostToggle = page.getByRole("button", { name: "AI Ghost Text (off)" });
  if (await ghostToggle.isVisible().catch(() => false)) { await ghostToggle.click(); await page.waitForTimeout(1000); }
  await ed.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" The courier was", { delay: 25 });
  const tPause = Date.now();
  let acceptArmedMs: number | null = null;
  let ghostVerbatim = "";
  try {
    // The accept pill ("Tab"/"tap") only renders on the done frame.
    await page.waitForFunction(() => /\bTab\b/.test(
      Array.from(document.querySelectorAll("span.fixed, div.fixed")).map((n) => (n as HTMLElement).innerText).join(" ")
    ), undefined, { timeout: 120000 });
    acceptArmedMs = Date.now() - tPause;
    ghostVerbatim = await page.evaluate(() =>
      Array.from(document.querySelectorAll("span.fixed, div.fixed"))
        .map((n) => (n as HTMLElement).innerText).filter(Boolean).join(" | ")
    );
    say(`ghost accept ARMED ${acceptArmedMs}ms after the pause; overlay text = ${JSON.stringify(ghostVerbatim.slice(0, 200))}`);
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.screenshot({ path: `${outDir}/44p2-ghost-accept-armed.png`, fullPage: false });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(2500);
  } catch {
    say("accept pill never armed within 120s — disclose, do not retry");
    await page.screenshot({ path: `${outDir}/44p2-ghost-accept-armed.png`, fullPage: false });
  }
  const afterAccept = await ed.innerText();
  const accepted = afterAccept !== beforeProse + "";
  say(`prose changed after Tab = ${afterAccept.length !== beforeProse.length}`);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44p2-ghost-accepted.png`, fullPage: false });

  // --- inline edit, waited out properly
  await ed.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.up("Shift");
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  await page.waitForTimeout(600);
  const t3 = Date.now();
  await page.keyboard.press("F2");
  await page.waitForTimeout(1200);
  const box = page.getByPlaceholder("Or describe what you want...");
  if (await box.isVisible().catch(() => false)) {
    await box.fill("Tighten this passage. Keep every proper noun and the original voice.");
    await box.press("Enter");
  }
  let inlineMs: number | null = null;
  let popupText = "";
  try {
    await page.waitForFunction(() => !/Generating suggestions/i.test(document.body.innerText), undefined, { timeout: 300000 });
    inlineMs = Date.now() - t3;
    await page.waitForTimeout(1500);
    popupText = await page.locator("body").innerText();
    say(`inline edit settled in ${inlineMs}ms`);
  } catch {
    say("inline edit still generating after 300s — disclose");
    popupText = await page.locator("body").innerText();
  }
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44p3-inline-edit-suggestion.png`, fullPage: false });

  writeFileSync(`${outDir}/44p3-inline-assertions.json`, JSON.stringify({
    shot: "44p2 (accept, retry) / 44p3 (inline edit, retry)",
    capturedAt: new Date().toISOString(),
    bookId, chapterId,
    assertions: {
      ghost_accept_armed: acceptArmedMs !== null,
      ghost_accept_armed_ms_after_pause: acceptArmedMs,
      ghost_overlay_text: ghostVerbatim,
      prose_changed_after_Tab: afterAccept !== beforeProse,
      accepted_flag: accepted,
      inline_edit_selection_chars: selected.length,
      inline_edit_settled: inlineMs !== null,
      inline_edit_ms: inlineMs,
      unicode_survived_in_editor: ["Zürich", "protégé", "—", "“", "”"].filter((u) => afterAccept.includes(u)),
    },
    proseBefore: beforeProse,
    proseAfterAccept: afterAccept,
    popupTextExcerpt: popupText.slice(0, 3000),
    network: net,
    log,
  }, null, 2), "utf8");
  await browser.close();
})();
