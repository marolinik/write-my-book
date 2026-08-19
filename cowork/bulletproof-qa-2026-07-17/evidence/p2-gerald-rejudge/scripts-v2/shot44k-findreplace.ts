/**
 * Shots 44k1 / 44k2 / 44k3 — book-wide Find & Replace IN THE UI, with the whole-word trap.
 *
 * TEST-PLAN names "book-wide find/replace with an anchored-span trap" as a core P2
 * surface; the 07-18 baseline proved the API (4,617 replacements, 29/29 byte-exact) but
 * the UI has never been captured, and the trust judge filed an S3 for the substring
 * hazard (renaming `Sam` -> `Max` turns `same` into `maxe`). This drives the real dialog
 * (Ctrl+Shift+F) on a two-chapter capture book and records EXACTLY what a character
 * rename does to the surrounding prose.
 *
 *   44k1  the Find & Replace dialog with a live book-wide match list
 *   44k2  the result toast + the prose after "Replace all"
 *   44k3  the collateral damage (or absence of it) shown in the editor
 *
 * Runs on its own P2-CAPTURE-FINDREPLACE-* book. Gerald's manuscript is not touched.
 *
 * Usage: npx tsx --env-file=.env shot44k-findreplace.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const outDir = process.argv[2];
const HIDE = "nextjs-portal{display:none !important}";
const log: string[] = [];
const say = (m: string) => { const l = `[${new Date().toISOString()}] ${m}`; log.push(l); console.log(l); };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const t = await r.text(); let j: unknown = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, json: j as never, text: t };
}

const CH1 = `Sam Kessler had never trusted a courier who smiled. It was the same smile every time — the same tilt, the same apology in the shoulders. “Sam,” Ilse said, “you and I want the same thing.” He weighed the sample in his palm. Zürich had taught Sam that samples lie, and that the same lie, told twice, becomes a ledger entry.`;
const CH2 = `In Łódź, Sam counted the notes twice. The samovar hissed; the room smelled of the same wet ash it always did. “Assume nothing,” Sam wrote in the margin, and underlined it. Sam's handwriting was the same as it had been in Kőszeg — cramped, unhurried, and exactly the same slant.`;

(async () => {
  const stamp = Date.now();
  const mk = await api("/api/books", { method: "POST", body: JSON.stringify({ name: `P2-CAPTURE-FINDREPLACE-${stamp}`, genre: "Thriller", language: "en" }) });
  const bookId = (mk.json as { id: string; firstChapterId: string }).id;
  const ch1Id = (mk.json as { firstChapterId: string }).firstChapterId;
  await api(`/api/books/${bookId}/chapters/${ch1Id}/content`, { method: "PUT", body: JSON.stringify({ markdown: CH1 }) });
  const ch2 = await api(`/api/books/${bookId}/chapters`, { method: "POST", body: JSON.stringify({ chapterNumber: 2, actNumber: 1, title: "The Trieste Signal" }) });
  const ch2Id = (ch2.json as { id: string }).id;
  await api(`/api/books/${bookId}/chapters/${ch2Id}/content`, { method: "PUT", body: JSON.stringify({ markdown: CH2 }) });
  say(`find/replace fixture book=${bookId} ch1=${ch1Id} ch2=${ch2Id}`);

  const countSam = (s: string) => (s.match(/Sam/g) ?? []).length;
  const countSame = (s: string) => (s.match(/same/g) ?? []).length;
  say(`seeded: ch1 "Sam"×${countSam(CH1)} "same"×${countSame(CH1)}; ch2 "Sam"×${countSam(CH2)} "same"×${countSame(CH2)}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => { if (r.url().includes("/search")) net.push({ url: r.url().replace(BASE, ""), method: r.request().method(), status: r.status() }); });

  await page.goto(`${BASE}/books/${bookId}/chapters/${ch1Id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2500);

  // ---- open Find & Replace
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+Shift+F");
  await page.getByLabel("Find", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByLabel("Find", { exact: true }).fill("Sam");
  await page.waitForTimeout(2500);
  // Book-wide scope
  await page.getByRole("radio", { name: "Whole book" }).click().catch(async () => {
    await page.getByText("Whole book", { exact: true }).click();
  });
  await page.waitForTimeout(2000);
  await page.getByLabel("Replace with", { exact: true }).fill("Max");
  // The live preview is debounced; "Replace all" fired while it still read "Searching…"
  // in the first pass, so nothing was replaced. Wait for the settled match count.
  await page.waitForFunction(() => /\d+\s+match(es)?\s+in\s+\d+\s+chapters?/.test(document.body.innerText), undefined, { timeout: 60000 });
  await page.waitForTimeout(800);
  const dialogText = await page.getByRole("dialog").innerText();
  const hasWholeWordToggle = /whole\s*word/i.test(dialogText);
  say(`dialog offers a whole-word option = ${hasWholeWordToggle}`);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44k1-find-replace-dialog-bookwide.png`, fullPage: false });

  // ---- replace all
  const replaceBtn = page.getByRole("button", { name: /Replace all|Replace All|Replace \d+/ }).first();
  await replaceBtn.click();
  await page.waitForTimeout(4000);
  const toastText = await page.locator("[data-sonner-toast], [role='status']").first().innerText().catch(() => "");
  say(`result toast: ${JSON.stringify(toastText)}`);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44k2-replace-all-result.png`, fullPage: false });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/44k3-prose-after-rename.png`, fullPage: false });

  const after1 = ((await api(`/api/books/${bookId}/chapters/${ch1Id}/content`)).json as { markdown?: string })?.markdown ?? "";
  const after2 = ((await api(`/api/books/${bookId}/chapters/${ch2Id}/content`)).json as { markdown?: string })?.markdown ?? "";
  const corrupted1 = (after1.match(/maxe/g) ?? []).length;
  const corrupted2 = (after2.match(/maxe/g) ?? []).length;
  const samovar = /Maxovar|samovar/.exec(after2)?.[0] ?? null;
  say(`ch1 collateral "maxe" occurrences = ${corrupted1}; ch2 = ${corrupted2}; samovar rendered as "${samovar}"`);

  writeFileSync(`${outDir}/44k-findreplace-assertions.json`, JSON.stringify({
    shot: "44k1-44k3",
    dims: "D1 / D3 (core revision tool) — book-wide find & replace UI + whole-word hazard",
    capturedAt: new Date().toISOString(),
    identity: "user_qa_p2 via header",
    fixture: { bookId, ch1Id, ch2Id },
    seeded: { ch1: CH1, ch2: CH2 },
    assertions: {
      dialog_opened_with_ctrl_shift_f: true,
      dialog_offers_whole_word_option: hasWholeWordToggle,
      dialog_offers_case_sensitive_option: /case/i.test(dialogText),
      dialog_offers_scope_switch: /Whole book/i.test(dialogText),
      result_toast: toastText,
      ch1_collateral_maxe_count: corrupted1,
      ch2_collateral_maxe_count: corrupted2,
      samovar_after_rename: samovar,
      character_rename_was_clean: corrupted1 === 0 && corrupted2 === 0,
    },
    proseAfter: { ch1: after1, ch2: after2 },
    dialogTextVerbatim: dialogText,
    network: net,
    log,
  }, null, 2), "utf8");
  await browser.close();
})();
