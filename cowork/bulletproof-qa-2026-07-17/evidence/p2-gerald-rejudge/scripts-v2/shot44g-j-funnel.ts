/**
 * Shots 44g … 44j — D4 (onboarding / time-to-first-word), GERALD-AUTHENTIC COLD FUNNEL.
 *
 * P2's D4 has never had a fresh-user funnel: every prior measurement was taken on the
 * already-onboarded `user_qa_p2` account. This runs the whole day-0 journey on a
 * genuinely cold identity (`user_qa_p2cold`: onboardingComplete=false, zero books, no
 * BYOK key, no subscription row = free tier) and stamps wall-clock at every step.
 *
 * Gerald's day-0 is NOT "type a first sentence" — it is "get the 40,000-word thriller I
 * already wrote into this thing without losing a word". So the funnel includes the
 * IMPORT leg (the thing P6's v2 panel explicitly docked D4 for leaving unexercised).
 *
 *   44g   /onboarding step 1 (welcome)
 *   44g2  /onboarding step 2 — the card-free / key-free on-ramp ("Skip for now")
 *   44h   /books/new — name your book (where Skip lands the writer)
 *   44h2  where book creation lands
 *   44i   import wizard: 42K-word, 8-chapter .md dropped in, structure preview
 *   44i2  import confirmed — chapters landed with word counts
 *   44j   first words typed into Chapter 1 and autosaved
 *
 * Identity: e2e headers only. NO .env flip (see UI-CAPTURE doc §Deviations).
 *
 * Usage: npx tsx --env-file=.env shot44g-j-funnel.ts <outDir> <fixtureMdPath>
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2cold" };
const [outDir, fixturePath] = process.argv.slice(2);
if (!outDir || !fixturePath) { console.error("usage: <outDir> <fixtureMdPath>"); process.exit(1); }
const HIDE = "nextjs-portal{display:none !important}";
const log: string[] = [];
const T0 = Date.now();
const marks: Record<string, number> = {};
const mark = (k: string) => { marks[k] = Date.now() - T0; say(`MARK ${k} @ +${marks[k]}ms`); };
const say = (m: string) => { const l = `[${new Date().toISOString()}] ${m}`; log.push(l); console.log(l); };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const t = await r.text();
  let j: unknown = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, json: j as never, text: t };
}

(async () => {
  // Pre-state: prove the identity really is cold.
  const preBooks = await api("/api/books");
  const preCount = Array.isArray(preBooks.json) ? (preBooks.json as unknown[]).length : ((preBooks.json as { books?: unknown[] })?.books?.length ?? -1);
  say(`cold identity pre-state: GET /api/books -> ${preBooks.status}, ${preCount} books`);
  const preOnb = await api("/api/settings/onboarding");
  say(`cold identity pre-state: onboarding -> ${preOnb.text.slice(0, 200)}`);

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
    if (u.includes("/api/")) net.push({ url: u.replace(BASE, ""), method: r.request().method(), status: r.status(), atMs: Date.now() - T0 });
  });

  // ---- 44g: first screen a brand-new writer sees
  await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.getByRole("button", { name: /Get Started|Continue|Next/i }).first().waitFor({ timeout: 60000 });
  mark("onboarding_step1_visible");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/44g-cold-onboarding-step1.png`, fullPage: false });
  const step1Text = await page.locator("body").innerText();

  // ---- 44g2: step 2 — the key-free on-ramp
  await page.getByRole("button", { name: /Get Started|Continue|Next/i }).first().click();
  await page.getByRole("heading", { name: "Add Your API Keys" }).waitFor({ timeout: 30000 });
  mark("onboarding_step2_visible");
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44g2-cold-onboarding-keys-skip-available.png`, fullPage: false });
  const skipBtn = page.getByRole("button", { name: /Skip for now/ });
  const skipVisible = await skipBtn.isVisible();
  say(`"Skip for now — start writing free" visible on a key-less account = ${skipVisible}`);

  // ---- 44h: skip lands on "name your book"
  await skipBtn.click();
  await page.waitForURL(/\/books\/new/, { timeout: 60000 });
  mark("landed_on_books_new");
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44h-cold-new-book-form.png`, fullPage: false });

  // Fill the form the way Gerald would.
  const nameInput = page.locator('input#name, input[name="name"]').first();
  await nameInput.fill("Dead Reckoning (book 31)");
  await page.waitForTimeout(400);
  const createBtn = page.getByRole("button", { name: /Create|Start|Continue/i }).first();
  await createBtn.click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}/, { timeout: 90000 });
  mark("book_created");
  const bookId = (page.url().match(/\/books\/([0-9a-f-]{36})/) ?? [])[1];
  say(`book created: ${bookId} — landed on ${page.url()}`);
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44h2-cold-post-create-landing.png`, fullPage: false });

  // ---- 44i: the IMPORT leg — Gerald's real day-0
  const fixtureBytes = readFileSync(fixturePath);
  await page.goto(`${BASE}/books/${bookId}/transfer`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator('input[type="file"]').first().waitFor({ state: "attached", timeout: 60000 });
  mark("import_wizard_open");
  // Hydration settle: firing setInputFiles before React attaches the dropzone's
  // onChange handler drops the change event silently (harness artifact, not a defect).
  await page.waitForTimeout(3500);
  const tUpload = Date.now();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "dead-reckoning-31.md",
    mimeType: "text/markdown",
    buffer: fixtureBytes,
  });
  // Wait for the structure preview ("N chapters detected" + total word badge).
  await page.waitForFunction(() => /\d+\s+chapters?\s+detected/i.test(document.body.innerText), undefined, { timeout: 180000 });
  const previewMs = Date.now() - tUpload;
  mark("import_preview_rendered");
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44i-import-preview-structure.png`, fullPage: true });
  const previewText = await page.locator("body").innerText();
  say(`import preview rendered in ${previewMs}ms (file ${fixtureBytes.length} bytes)`);

  // Confirm the import.
  const confirmBtn = page.getByRole("button", { name: /^Import \d+ chapters?$/ }).first();
  const tConfirm = Date.now();
  await confirmBtn.click();
  await page.waitForFunction(() => /Import Complete/i.test(document.body.innerText), undefined, { timeout: 300000 });
  await page.waitForTimeout(2500);
  const confirmMs = Date.now() - tConfirm;
  mark("import_confirmed");
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44i2-import-confirmed.png`, fullPage: true });
  say(`import confirm took ${confirmMs}ms`);

  // Structure integrity, over the API.
  const chaptersRes = await api(`/api/books/${bookId}/chapters`);
  const chapters = (Array.isArray(chaptersRes.json) ? chaptersRes.json : (chaptersRes.json as { chapters?: unknown[] })?.chapters ?? []) as Array<{ id: string; chapterNumber: number; title: string | null; wordCount: number }>;
  say(`chapters after import: ${chapters.length} — ${chapters.map((c) => `${c.chapterNumber}:${c.title}(${c.wordCount}w)`).join(" | ")}`);
  const totalWords = chapters.reduce((a, c) => a + (c.wordCount ?? 0), 0);

  // ---- 44j: first words in the imported manuscript
  const ch1 = chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)[0];
  await page.goto(`${BASE}/books/${bookId}/chapters/${ch1.id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  mark("editor_ready_on_imported_chapter");
  await page.waitForTimeout(1200);
  const tType = Date.now();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Revision pass one — cut the fog. ", { delay: 15 });
  mark("first_word_typed");
  await page.getByTestId("editor-save-status").filter({ hasText: "Saved" }).first().waitFor({ timeout: 60000 });
  const typeToSavedMs = Date.now() - tType;
  mark("first_words_saved");
  await page.waitForTimeout(700);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44j-first-words-saved.png`, fullPage: false });
  say(`typed first words and reached "Saved" in ${typeToSavedMs}ms`);

  writeFileSync(`${outDir}/44g-j-funnel-assertions.json`, JSON.stringify({
    shot: "44g-44j",
    dim: "D4 onboarding / time-to-first-word (with the import leg)",
    capturedAt: new Date().toISOString(),
    identity: "user_qa_p2cold via x-e2e-clerk-id header — onboardingComplete=false, 0 books, no BYOK key, no subscription row (free tier). NO .env flip.",
    coldStatePreCheck: { booksApiStatus: preBooks.status, bookCount: preCount, onboardingApi: preOnb.text.slice(0, 300) },
    bookId,
    fixture: { path: fixturePath, bytes: fixtureBytes.length, declaredWords: "~42,188", declaredChapters: 8 },
    wallClockMsFromFirstPaintRequest: marks,
    timings: {
      import_preview_ms: previewMs,
      import_confirm_ms: confirmMs,
      typing_to_Saved_ms: typeToSavedMs,
      total_cold_start_to_first_words_saved_ms: marks["first_words_saved"],
    },
    assertions: {
      key_free_on_ramp_offered: skipVisible,
      skip_lands_on_name_your_book: true,
      chapters_after_import: chapters.length,
      chapter_titles: chapters.map((c) => c.title),
      total_words_after_import: totalWords,
      structure_landed_intact_8_chapters: chapters.length === 8,
      onboarding_step1_copy_excerpt: step1Text.slice(0, 400),
    },
    importPreviewTextExcerpt: previewText.slice(0, 2500),
    network: net,
    log,
  }, null, 2), "utf8");
  await browser.close();
})();
