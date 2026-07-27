/**
 * Shots 44q1 / 44q2 / 44q3 — D-115 (S3, OPEN) deleted-chapter prose resurrection, IN THE UI.
 *
 * D-115 is registered OPEN and is NOT being fixed in this wave (evidence wave, not a code
 * lane). This script captures what a writer actually sees, so the register's API trace
 * (evidence/p2-gerald-rejudge/api-traces/25-orphan-resurrect.txt) has a pixel counterpart.
 *
 *   44q1  the New Chapter form, auto-defaulting to the number of the chapter just deleted
 *   44q2  the brand-new, never-written chapter opening FULL of the deleted prose
 *   44q3  the first save of that legitimately-new chapter hitting a phantom 409
 *         whose conflict dialog quotes the deleted text back at the writer
 *
 * Safety: runs entirely inside its OWN fresh book (P2-CAPTURE-D115-*). Gerald's 40K
 * manuscript is never touched (see 44-manuscript-hashes-PRE/POST.txt).
 * Disclosure: chapter DELETE has no UI affordance today (useDeleteChapter has zero
 * component consumers), so the delete leg is driven over the API and labelled as such.
 *
 * Usage: npx tsx --env-file=.env shot44q-d115.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }
const HIDE = "nextjs-portal{display:none !important}";
const log: string[] = [];
const say = (m: string) => { const l = `[${new Date().toISOString()}] ${m}`; log.push(l); console.log(l); };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: r.status, json: json as never, text };
}

(async () => {
  const stamp = Date.now();
  const SENTINEL = "GHOST_SECRET_9f3a";
  const DELETED_PROSE = `The chapter Gerald deleted on purpose. ${SENTINEL}. Every word here was supposed to be gone forever.`;

  const mk = await api("/api/books", { method: "POST", body: JSON.stringify({ name: `P2-CAPTURE-D115-${stamp}`, genre: "Thriller", language: "en" }) });
  const bookId = (mk.json as { id: string }).id;
  say(`fixture book=${bookId}`);

  // 1) create chapter 2 and give it prose containing the sentinel
  const ch2 = await api(`/api/books/${bookId}/chapters`, { method: "POST", body: JSON.stringify({ chapterNumber: 2, actNumber: 1, title: "Doomed Chapter" }) });
  const oldChapterId = (ch2.json as { id: string }).id;
  const put = await api(`/api/books/${bookId}/chapters/${oldChapterId}/content`, { method: "PUT", body: JSON.stringify({ markdown: DELETED_PROSE }) });
  say(`chapter 2 (${oldChapterId}) seeded -> PUT ${put.status}`);

  // 2) DELETE chapter 2 (API-only: no UI affordance exists today)
  const del = await api(`/api/books/${bookId}/chapters/${oldChapterId}`, { method: "DELETE" });
  say(`DELETE chapter 2 -> ${del.status} ${del.text.slice(0, 120)}`);
  const orphanGet = await api(`/api/books/${bookId}/chapters/${oldChapterId}/content`);
  say(`GET deleted chapter content -> ${orphanGet.status}`);

  // --- browser: the writer's side of the story
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
    if (r.url().includes("/chapters")) net.push({ url: r.url().replace(BASE, ""), method: r.request().method(), status: r.status(), at: new Date().toISOString() });
  });

  // 3) 44q1 — the New Chapter form (auto-defaults to 2, the number just freed)
  await page.goto(`${BASE}/books/${bookId}/chapters/new`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator("#chapterNumber").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const defaultNumber = await page.locator("#chapterNumber").inputValue();
  say(`New Chapter form default chapterNumber = ${defaultNumber}`);
  await page.screenshot({ path: `${outDir}/44q1-new-chapter-form-defaults-to-freed-number.png`, fullPage: false });

  // Submit — a brand-new chapter the writer has never typed a word into.
  await page.getByRole("button", { name: /Create/i }).first().click();
  await page.waitForURL(/\/chapters\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const newChapterId = page.url().split("/").pop() as string;
  say(`new chapter created: ${newChapterId} (url ${page.url()})`);

  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const editorText = await page.locator(".ProseMirror").innerText();
  const wordCounter = await page.locator("text=/\\d+ words/").first().innerText().catch(() => "");
  say(`brand-new chapter editor contains the DELETED prose sentinel = ${editorText.includes(SENTINEL)}; word counter reads "${wordCounter}"`);
  await page.screenshot({ path: `${outDir}/44q2-brand-new-chapter-full-of-deleted-prose.png`, fullPage: false });

  // API view of the same moment (the wordCount:0 vs non-empty body inconsistency)
  const newGet = await api(`/api/books/${bookId}/chapters/${newChapterId}/content`);
  const newGetJson = newGet.json as { markdown?: string; wordCount?: number; version?: number };
  say(`GET new chapter content -> ${newGet.status} wordCount=${newGetJson?.wordCount} markdownLen=${(newGetJson?.markdown ?? "").length} containsSentinel=${(newGetJson?.markdown ?? "").includes(SENTINEL)}`);

  // 4) 44q3 — first save of the legitimately-new chapter hits a phantom 409
  const ed = page.locator(".ProseMirror");
  await ed.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Gerald's actual first sentence for this chapter.", { delay: 12 });
  let phantom = false;
  const chip = page.getByRole("button", { name: /Conflict/ });
  try {
    await chip.waitFor({ state: "visible", timeout: 45000 });
    phantom = true;
  } catch { /* no conflict surfaced */ }
  let dialogText = "";
  if (phantom) {
    await chip.click();
    await page.getByRole("heading", { name: "Chapter changed outside this editor" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    dialogText = await page.getByRole("dialog").innerText();
    await page.addStyleTag({ content: HIDE }).catch(() => {});
    await page.screenshot({ path: `${outDir}/44q3-phantom-409-quotes-deleted-text.png`, fullPage: false });
    say(`phantom 409 dialog leaks the deleted prose back to the writer = ${dialogText.includes(SENTINEL)}`);
  } else {
    await page.screenshot({ path: `${outDir}/44q3-phantom-409-quotes-deleted-text.png`, fullPage: false });
    say("no conflict chip appeared within 45s — first save did NOT 409 (disclose, do not retry)");
  }

  writeFileSync(`${outDir}/44q-d115-assertions.json`, JSON.stringify({
    shot: "44q1-44q3",
    defect: "D-115 (S3, registered OPEN, live instance of deferred D-22) — captured, NOT fixed in this wave",
    capturedAt: new Date().toISOString(),
    identity: "user_qa_p2 via x-e2e-clerk-id header (no .env flip)",
    fixture: { bookId, deletedChapterId: oldChapterId, newChapterId, name: `P2-CAPTURE-D115-${stamp}` },
    sentinel: SENTINEL,
    deletedProse: DELETED_PROSE,
    assertions: {
      delete_chapter_has_no_ui_affordance: true,
      delete_status: del.status,
      get_deleted_chapter_content_status_after_delete: orphanGet.status,
      new_chapter_form_default_number: defaultNumber,
      new_chapter_form_default_is_the_freed_number: defaultNumber === "2",
      brand_new_chapter_editor_shows_deleted_prose: editorText.includes(SENTINEL),
      editor_word_counter_text: wordCounter,
      api_get_new_chapter_wordCount: newGetJson?.wordCount ?? null,
      api_get_new_chapter_markdown_length: (newGetJson?.markdown ?? "").length,
      api_get_new_chapter_markdown_contains_sentinel: (newGetJson?.markdown ?? "").includes(SENTINEL),
      wordCount_zero_but_body_non_empty_inconsistency:
        (newGetJson?.wordCount === 0) && (newGetJson?.markdown ?? "").length > 0,
      first_save_hit_phantom_409: phantom,
      phantom_dialog_quotes_deleted_text: phantom ? dialogText.includes(SENTINEL) : null,
    },
    editorTextVerbatim: editorText,
    dialogTextVerbatim: dialogText,
    network: net,
    log,
  }, null, 2), "utf8");
  await browser.close();
})();
