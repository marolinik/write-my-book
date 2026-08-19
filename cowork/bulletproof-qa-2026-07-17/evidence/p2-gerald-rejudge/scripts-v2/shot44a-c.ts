/**
 * Shots 44a / 44b / 44c / 44c2 — D10 (delight) two-tab conflict drill, ON CAMERA.
 *
 * Re-shoots on the CURRENT build the three artifacts that scored D10 7.0 at the
 * 07-18 baseline and were dropped from the 07-20 API-only bundle:
 *   44a  losing tab: non-blocking conflict chip, dialog NOT open, typing uninterrupted,
 *        loser's words still live in the editor, server head still holds the winner's text
 *   44b  SaveConflictDialog open: yours/theirs diff + the promise line
 *   44c  after "Load theirs": Version History panel open (the promise's receipt)
 *   44c2 the conflict-backup version VIEWED — the discarded words, verbatim, recoverable
 *
 * R3: writes ONLY to 44-series paths. The committed 07-18 baseline screenshots in
 * evidence/w4-ui-drills/screenshots/x1-b-*.png are NOT touched (this is a standalone
 * script, not tests/e2e/x1-two-tab-conflict.spec.ts, whose paths are hardcoded there).
 * R5/R6: owns its own fresh book (P2-CAPTURE-CONFLICT-*), never the 40K manuscript.
 *
 * Usage: npx tsx --env-file=.env shot44a-c.ts <outDir>
 */
import { chromium, type Page } from "playwright";
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
  return { status: r.status, json: await r.json().catch(() => null) };
}

async function openEditor(page: Page, bookId: string, chapterId: string, expect: string) {
  await page.goto(`${BASE}/books/${bookId}/chapters/${chapterId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction((t) => (document.querySelector(".ProseMirror") as HTMLElement)?.innerText.includes(t), expect, { timeout: 30000 });
  await page.waitForTimeout(800);
}

async function typeAtEnd(page: Page, text: string) {
  const ed = page.locator(".ProseMirror");
  await ed.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text, { delay: 12 });
}

(async () => {
  const stamp = Date.now();
  // Gerald-authentic baseline: unicode place names, em dash, curly quotes.
  const BASELINE = "The ledger in Zürich balanced — it always did. “Kőszeg,” Marek said, and the line went dead.";
  const A_WORDS = " Trieste answered on the third ring; Łódź never answered at all.";
  const B_WORDS = " The words Gerald typed on the other device — and does not intend to lose.";

  const mk = await api("/api/books", { method: "POST", body: JSON.stringify({ name: `P2-CAPTURE-CONFLICT-${stamp}`, genre: "Thriller", language: "en" }) });
  if (mk.status >= 300) { console.error("book create failed", mk); process.exit(1); }
  const bookId = mk.json.id as string;
  const chapterId = mk.json.firstChapterId as string;
  say(`fixture book=${bookId} chapter=${chapterId}`);
  const contentUrl = `/api/books/${bookId}/chapters/${chapterId}/content`;
  const seed = await api(contentUrl, { method: "PUT", body: JSON.stringify({ markdown: BASELINE }) });
  say(`seed PUT -> ${seed.status} v${seed.json?.version}`);

  const browser = await chromium.launch({ headless: true });
  const mkCtx = async () => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
    await c.addInitScript(() => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none !important}";
      document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
    });
    return c;
  };
  const ctxA = await mkCtx(); const pageA = await ctxA.newPage();
  const ctxB = await mkCtx(); const pageB = await ctxB.newPage();

  const netB: Array<Record<string, unknown>> = [];
  pageB.on("response", (r) => {
    if (r.url().includes("/content") || r.url().includes("/versions")) {
      netB.push({ url: r.url().replace(BASE, ""), method: r.request().method(), status: r.status(), at: new Date().toISOString() });
    }
  });

  await openEditor(pageA, bookId, chapterId, "Zürich");
  await openEditor(pageB, bookId, chapterId, "Zürich");
  say("both tabs open on the same chapter (two independent browser contexts, same persona)");

  // --- A wins the race
  const tA = Date.now();
  await typeAtEnd(pageA, A_WORDS);
  await pageA.getByTestId("editor-save-status").filter({ hasText: "Saved" }).first().waitFor({ timeout: 30000 });
  const aSaveMs = Date.now() - tA;
  const afterA = await api(contentUrl);
  say(`tab A saved in ${aSaveMs}ms; server head v${afterA.json?.version} contains A's words: ${String(afterA.json?.markdown ?? "").includes("Trieste answered")}`);

  // --- B types, unaware. Its stamped PUT carries the stale version -> 409.
  const tB = Date.now();
  await typeAtEnd(pageB, B_WORDS);
  const chip = pageB.getByRole("button", { name: /Conflict/ });
  await chip.waitFor({ state: "visible", timeout: 40000 });
  const chipMs = Date.now() - tB;
  const dialogCountAtChip = await pageB.getByRole("dialog").count();
  // Typing must still be possible while the conflict is pending (non-blocking).
  await typeAtEnd(pageB, " Still typing.");
  await pageB.waitForTimeout(500);
  const bEditorText = await pageB.locator(".ProseMirror").innerText();
  const stillA = await api(contentUrl);
  say(`tab B: conflict chip visible after ${chipMs}ms; dialogs open at that moment = ${dialogCountAtChip}`);

  await pageB.addStyleTag({ content: HIDE }).catch(() => {});
  await pageB.screenshot({ path: `${outDir}/44a-conflict-chip-nonblocking.png`, fullPage: false });

  // --- 44b: explicit review opens the dialog
  await chip.click();
  await pageB.getByRole("heading", { name: "Chapter changed outside this editor" }).waitFor({ timeout: 20000 });
  await pageB.waitForTimeout(700);
  const dialogText = await pageB.getByRole("dialog").innerText();
  await pageB.screenshot({ path: `${outDir}/44b-conflict-dialog-diff.png`, fullPage: false });
  say(`dialog open; promise line present = ${dialogText.includes("stays in version history")}`);

  // --- Load theirs
  const tL = Date.now();
  await pageB.getByRole("button", { name: "Load theirs" }).click();
  await pageB.waitForFunction(() => {
    const t = (document.querySelector(".ProseMirror") as HTMLElement)?.innerText ?? "";
    return t.includes("Trieste answered") && !t.includes("does not intend to lose");
  }, undefined, { timeout: 40000 });
  const loadMs = Date.now() - tL;
  const afterLoad = await pageB.locator(".ProseMirror").innerText();
  say(`"Load theirs" resolved in ${loadMs}ms; B's words removed from live editor`);

  // --- 44c: Version History panel (the receipt)
  await pageB.getByRole("button", { name: "Version History" }).click();
  await pageB.waitForTimeout(1500);
  await pageB.addStyleTag({ content: HIDE }).catch(() => {});
  await pageB.screenshot({ path: `${outDir}/44c-version-history-after-load-theirs.png`, fullPage: false });

  // Resolve the backup version from the API (the panel shows changeType, not changeSource).
  const doc = await api(contentUrl);
  const documentId = doc.json?.documentId as string;
  const vers = await api(`/api/books/${bookId}/documents/${documentId}/versions`);
  const versions = (Array.isArray(vers.json) ? vers.json : vers.json?.versions ?? []) as Array<{ version: number; changeSource: string | null; changeType: string; wordCount: number }>;
  const backup = versions.find((v) => v.changeSource === "conflict-backup");
  say(`versions: ${versions.map((v) => `v${v.version}/${v.changeType}/${v.changeSource}`).join(", ")}`);

  // --- 44c2: view the backup version's actual content in the UI
  let backupContentInUi = "";
  if (backup) {
    const idx = versions.findIndex((v) => v.version === backup.version);
    const viewBtns = pageB.locator('[title="View version"]');
    const n = await viewBtns.count();
    say(`view-version buttons in panel: ${n} (targeting index ${idx})`);
    await viewBtns.nth(Math.min(idx, Math.max(n - 1, 0))).click({ force: true });
    await pageB.waitForTimeout(1800);
    await pageB.addStyleTag({ content: HIDE }).catch(() => {});
    backupContentInUi = await pageB.getByRole("dialog").first().innerText().catch(() => "");
    await pageB.screenshot({ path: `${outDir}/44c2-conflict-backup-version-viewed.png`, fullPage: false });
    say(`backup version v${backup.version} viewed in UI; contains B's discarded words = ${backupContentInUi.includes("does not intend to lose")}`);
  } else {
    say("WARNING: no conflict-backup version row found");
  }

  // API-level proof of the backup content (byte check)
  let backupApiContent: string | null = null;
  if (backup) {
    const bc = await api(`/api/books/${bookId}/documents/${documentId}/versions/${backup.version}`);
    backupApiContent = (bc.json?.content ?? null) as string | null;
  }

  const assertions = {
    shot: "44a-44c2",
    dim: "D10 delight (also D2 data-safety)",
    capturedAt: new Date().toISOString(),
    base: BASE,
    identity: "user_qa_p2 via x-e2e-clerk-id header (no .env flip)",
    fixture: { bookId, chapterId, name: `P2-CAPTURE-CONFLICT-${stamp}` },
    baselineText: BASELINE,
    tabA_words: A_WORDS,
    tabB_words: B_WORDS,
    timings: { tabA_typing_to_Saved_ms: aSaveMs, tabB_typing_to_conflictChip_ms: chipMs, loadTheirs_resolve_ms: loadMs },
    assertions: {
      conflict_chip_visible: true,
      dialog_open_count_when_chip_appeared: dialogCountAtChip,
      dialog_never_auto_opened: dialogCountAtChip === 0,
      typing_continued_after_conflict: bEditorText.includes("Still typing."),
      losers_words_still_live_pre_resolve: bEditorText.includes("does not intend to lose"),
      server_head_untouched_by_loser: !String(stillA.json?.markdown ?? "").includes("does not intend to lose"),
      server_head_holds_winner: String(stillA.json?.markdown ?? "").includes("Trieste answered"),
      dialog_promise_line_present: dialogText.includes("stays in version history"),
      dialog_shows_both_sides: dialogText.includes("does not intend to lose") && dialogText.includes("Trieste answered"),
      editor_after_load_theirs_is_theirs: afterLoad.includes("Trieste answered") && !afterLoad.includes("does not intend to lose"),
      conflict_backup_version_exists: !!backup,
      conflict_backup_version_number: backup?.version ?? null,
      conflict_backup_changeType_badge_shown_in_ui: backup?.changeType ?? null,
      conflict_backup_content_contains_losers_words_API: backupApiContent ? backupApiContent.includes("does not intend to lose") : null,
      conflict_backup_content_visible_in_UI_viewer: backupContentInUi ? backupContentInUi.includes("does not intend to lose") : null,
    },
    versionLedger: versions.map((v) => ({ version: v.version, changeType: v.changeType, changeSource: v.changeSource, wordCount: v.wordCount })),
    dialogTextVerbatim: dialogText,
    networkTabB: netB,
    log,
  };
  writeFileSync(`${outDir}/44a-c-assertions.json`, JSON.stringify(assertions, null, 2), "utf8");
  say("assertions written");
  await browser.close();
})();
