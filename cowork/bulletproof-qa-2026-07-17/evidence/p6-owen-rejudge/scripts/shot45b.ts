/**
 * Shot 45b — D-161 + the timed Done -> first-words funnel (judges' #1 ask).
 *
 * Resets setupComplete via the SAME D-35 PATCH the wizard itself uses
 * (PATCH /api/books/:id/settings {setupComplete:false}), re-walks the wizard
 * on camera, then clicks "Start Writing!" and measures, with wall-clock:
 *   Done-click -> URL change -> editor mounted/editable -> first word rendered
 *   -> full sentence rendered.
 * Also proves the create-or-open path did NOT mint a duplicate Chapter 1.
 *
 * Usage: npx tsx --env-file=.env shot45b.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "8632ba0c-f05b-4fd5-9581-3790a0f2c675";
const CLERK = "user_qa_p6";
const SENTENCE = "The lamp room smelled of paraffin and cold brass.";
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
  const trace: Array<Record<string, unknown>> = [];

  // 0. State before: chapters + settings
  const chBefore = await api.get(BASE + "/api/books/" + BOOK + "/chapters");
  const chaptersBefore = await chBefore.json();
  const setBefore = await api.get(BASE + "/api/books/" + BOOK + "/settings");
  const settingsBefore = await setBefore.json();

  // 1. The D-35 PATCH itself, used as the reset lever (documented).
  const reset = await api.patch(BASE + "/api/books/" + BOOK + "/settings", {
    headers: { ...H, "Content-Type": "application/json" },
    data: { setupComplete: false },
  });
  const resetBody = await reset.json();
  trace.push({ step: "reset-setupComplete", status: reset.status(), setupComplete: resetBody.setupComplete });

  // 2. ENV-01 route warm (dev-server JIT compile is not a product property):
  //    server-render both routes once before the timed leg, and record the cost.
  const warm: Record<string, number> = {};
  const warmTargets: Array<[string, string]> = [
    ["setup", BASE + "/books/" + BOOK + "/setup"],
    ["editor", BASE + "/books/" + BOOK + "/chapters/" + (chaptersBefore[0] ? chaptersBefore[0].id : "")],
  ];
  for (const pair of warmTargets) {
    const t = Date.now();
    const r = await api.get(pair[1]);
    warm[pair[0]] = Date.now() - t;
    trace.push({ step: "warm-" + pair[0], status: r.status(), ms: warm[pair[0]] });
  }

  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.indexOf("/api/books/") >= 0) {
      net.push({ url: u.replace(BASE, ""), method: r.request().method(), status: r.status(), at: Date.now() });
    }
  });

  // 3. Wizard entry
  await page.goto(BASE + "/books/" + BOOK + "/setup", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.getByText(/steps done/).waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
  const headerBadge = (await page.getByText(/steps done/).innerText()).trim();
  await page.screenshot({ path: outDir + "/45b1-wizard-entry.png", fullPage: false });

  // 4. Step back to Import to capture the D-163 pluralised banner, then forward.
  const backBtn = page.getByRole("button", { name: /^Back$/ });
  let importShotDone = false;
  for (let i = 0; i < 4; i++) {
    if ((await backBtn.count()) === 0) break;
    await backBtn.first().click();
    await page.waitForTimeout(900);
    const txt = await page.locator("body").innerText();
    if (/Manuscript imported/i.test(txt)) {
      await page.screenshot({ path: outDir + "/45b2-import-step-plural.png", fullPage: false });
      const m = txt.match(/Manuscript imported[^\n]*/);
      trace.push({ step: "import-step", banner: m ? m[0] : null });
      importShotDone = true;
      break;
    }
  }

  // 5. Walk forward to Done via Continue/Skip.
  const walk: string[] = [];
  for (let i = 0; i < 8; i++) {
    const body = await page.locator("body").innerText();
    if (/Start Writing!/.test(body)) break;
    const fwd = page.getByRole("button", { name: /^(Continue|Skip)$/ });
    if ((await fwd.count()) === 0) break;
    const label = (await fwd.first().innerText()).trim();
    walk.push(label);
    await fwd.first().click();
    await page.waitForTimeout(1100);
  }
  await page.waitForTimeout(1500);
  const doneBody = await page.locator("body").innerText();
  await page.screenshot({ path: outDir + "/45b3-done-summary.png", fullPage: false });
  trace.push({ step: "walk", clicks: walk, importShotDone });

  // 6. THE TIMED LEG: Done-click -> editor -> first words.
  const startBtn = page.getByRole("button", { name: /Start Writing!/ });
  await startBtn.waitFor({ timeout: 30000 });
  const t0 = Date.now();
  await startBtn.click();

  await page.waitForURL(/\/chapters\//, { timeout: 180000 });
  const tUrl = Date.now() - t0;

  const pm = page.locator("div.ProseMirror[contenteditable='true']");
  await pm.waitFor({ state: "visible", timeout: 180000 });
  const tEditorVisible = Date.now() - t0;

  await pm.click({ timeout: 30000 });
  const tCaret = Date.now() - t0;

  const head = SENTENCE.slice(0, 3);
  await page.keyboard.type(head, { delay: 40 });
  await page.waitForFunction(
    (s) => {
      const el = document.querySelector("div.ProseMirror") as HTMLElement | null;
      return el ? el.innerText.indexOf(s) >= 0 : false;
    },
    head,
    { timeout: 60000 }
  );
  const tFirstWord = Date.now() - t0;

  await page.keyboard.type(SENTENCE.slice(3), { delay: 22 });
  await page.waitForFunction(
    (s) => {
      const el = document.querySelector("div.ProseMirror") as HTMLElement | null;
      return el ? el.innerText.indexOf(s) >= 0 : false;
    },
    SENTENCE,
    { timeout: 60000 }
  );
  const tSentence = Date.now() - t0;

  await page.waitForTimeout(4000); // let autosave / status bar settle
  await page.screenshot({ path: outDir + "/45b4-editor-first-words.png", fullPage: false });
  await page.screenshot({ path: outDir + "/45b4-editor-first-words-full.png", fullPage: true });

  const editorState = await page.evaluate(() => {
    const pmEl = document.querySelector("div.ProseMirror") as HTMLElement | null;
    const status = document.querySelector('[data-testid="editor-save-status"]') as HTMLElement | null;
    return {
      url: location.pathname,
      prose: pmEl ? pmEl.innerText : null,
      saveStatus: status ? status.innerText : null,
      bodyHead: (document.body as HTMLElement).innerText.slice(0, 1500),
    };
  });

  // 7. After-state: chapter count (duplicate-mint check) + settings persisted.
  const chAfter = await api.get(BASE + "/api/books/" + BOOK + "/chapters");
  const chaptersAfter = await chAfter.json();
  const setAfter = await api.get(BASE + "/api/books/" + BOOK + "/settings");
  const settingsAfter = await setAfter.json();

  const doneMatch = doneBody.match(/Book name[\s\S]{0,320}/);
  const report = {
    shot: "45b",
    book: BOOK,
    warmMs: warm,
    wizard: { headerBadge, walkClicks: walk, doneSummary: doneMatch ? doneMatch[0] : "" },
    funnelMs: {
      doneClickToUrlChange: tUrl,
      doneClickToEditorVisible: tEditorVisible,
      doneClickToCaret: tCaret,
      doneClickToFirstWordRendered: tFirstWord,
      doneClickToFullSentenceRendered: tSentence,
    },
    editorState,
    chapterCount: {
      before: chaptersBefore.length,
      after: chaptersAfter.length,
      idsBefore: chaptersBefore.map((c: { id: string }) => c.id),
      idsAfter: chaptersAfter.map((c: { id: string }) => c.id),
    },
    settings: { setupCompleteBefore: settingsBefore.setupComplete, setupCompleteAfter: settingsAfter.setupComplete },
    verdict: {
      landedInEditor: /\/chapters\//.test(editorState.url || ""),
      firstWordsUnder60s: tFirstWord < 60000,
      noDuplicateChapter: chaptersAfter.length === chaptersBefore.length,
      setupPersisted: settingsAfter.setupComplete === true,
    },
    trace,
    network: net.map((n) => ({ url: n.url, method: n.method, status: n.status, tMs: (n.at as number) - t0 })),
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(outDir + "/45b-assertions.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ warm, funnelMs: report.funnelMs, verdict: report.verdict, headerBadge, walk }, null, 2));
  await browser.close();
})();
