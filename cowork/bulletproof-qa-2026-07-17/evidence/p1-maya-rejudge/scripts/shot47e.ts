/**
 * Shot 47e — D-171: the one-way glass is now a window, and it opens.
 *
 * `/settings` now mounts `WriterMemoryPanel` with no bookId, i.e. every active row
 * the discuss loop ever wrote — global and per-book. This shot proves the rows are
 * REAL (they match psql), then revokes one **on camera**: the redundant near-dup
 * `bc68fab0` (which is also the D-184 hand-pruning demo), and re-reads the panel
 * and the API afterwards.
 *
 * Usage: npx tsx --env-file=.env shot47e.ts <outDir> <memoryIdToRevoke>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE } from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, REVOKE_ID] = process.argv.slice(2);
if (!outDir || !REVOKE_ID) { console.error("usage: <outDir> <memoryIdToRevoke>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

const PANEL_STATE = `(function(){
  var heads = Array.prototype.slice.call(document.querySelectorAll("div,section,h3,p,span"));
  var card = null;
  var titles = Array.prototype.slice.call(document.querySelectorAll("*"));
  for (var i = 0; i < titles.length; i++) {
    if ((titles[i].textContent || "").trim() === "Writer Memory" && titles[i].children.length <= 1) {
      var n = titles[i];
      for (var up = 0; up < 6 && n; up++) { n = n.parentElement; if (n && /rounded/.test(n.className || "")) { card = n; break; } }
      break;
    }
  }
  var forget = Array.prototype.slice.call(document.querySelectorAll('[aria-label^="Forget memory:"]'))
    .map(function (b) { return { label: b.getAttribute("aria-label"), visible: !!(b.offsetWidth || b.offsetHeight) }; });
  var edit = document.querySelectorAll('[aria-label^="Edit memory:"]').length;
  return {
    panelPresent: !!card,
    panelText: card ? card.innerText : null,
    forgetButtons: forget,
    editButtonCount: edit,
    bodyHasWriterMemory: /Writer Memory/.test(document.body.innerText)
  };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];

  // ENV-01 warm, then the API truth we will hold the panel to.
  const t0 = Date.now();
  trace.push({ step: "warm-settings", status: (await api.get(`${BASE}/settings`)).status(), ms: Date.now() - t0 });
  const before = await (await api.get(`${BASE}/api/memory`)).json();

  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));
  const netLog: Array<Record<string, unknown>> = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/memory")) netLog.push({ at: Date.now(), phase: "request", method: r.method(), url: r.url().replace(BASE, "") });
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/memory")) netLog.push({ at: Date.now(), phase: "requestfailed", method: r.method(), url: r.url().replace(BASE, ""), error: r.failure()?.errorText ?? null });
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/memory")) netLog.push({ at: Date.now(), phase: "response", method: r.request().method(), url: r.url().replace(BASE, ""), status: r.status() });
  });

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(6000);
  const anchor = page.getByText("Writer Memory", { exact: true }).first();
  await anchor.waitFor({ timeout: 60000 });
  await anchor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/47e1-settings-writer-memory-panel.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/47e1-settings-writer-memory-panel-full.png`, fullPage: true });
  const panelBefore = (await page.evaluate(PANEL_STATE)) as { panelPresent: boolean; panelText: string | null; forgetButtons: Array<{ label: string; visible: boolean }>; editButtonCount: number };

  // Revoke the redundant near-duplicate, by its own aria-label (D-171 touch fix).
  const target = (before as Array<{ id: string; content: string }>).find((m) => m.id === REVOKE_ID);
  if (!target) { console.error(`FATAL: ${REVOKE_ID} not in /api/memory`); await browser.close(); process.exit(1); }
  const btn = page.locator(`[aria-label="Forget memory: ${target.content}"]`).first();
  const btnCount = await btn.count();
  const btnVisible = btnCount > 0 ? await btn.isVisible() : false;
  if (btnCount > 0) await btn.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/47e2-before-revoke.png`, fullPage: false });
  const tClick = Date.now();
  if (btnCount > 0) await btn.click();

  // Does the panel drop the row on its own (react-query invalidate), and does the
  // server agree? Poll both for 12 s and record WHEN, instead of asserting one
  // arbitrary moment.
  const settleTimeline: Array<{ atMs: number; panelHasRow: boolean; apiHasRow: boolean; toast: string | null }> = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const panelHasRow = (await page.evaluate(`(function(){ return document.body.innerText.indexOf(${JSON.stringify(target.content)}) >= 0; })()`)) as boolean;
    const apiRows = (await (await api.get(`${BASE}/api/memory`)).json()) as Array<{ id: string }>;
    const toast = (await page.evaluate(`(function(){ var t = document.querySelector('[data-sonner-toast],[role="status"],.toast'); return t ? (t.innerText || "").trim().slice(0, 120) : null; })()`)) as string | null;
    settleTimeline.push({ atMs: Date.now() - tClick, panelHasRow, apiHasRow: apiRows.some((m) => m.id === REVOKE_ID), toast });
    if (i === 0) await page.screenshot({ path: `${outDir}/47e3-after-revoke.png`, fullPage: false });
    if (!panelHasRow && !settleTimeline[settleTimeline.length - 1].apiHasRow) break;
  }
  await page.screenshot({ path: `${outDir}/47e3-after-revoke-full.png`, fullPage: true });

  const panelAfter = (await page.evaluate(PANEL_STATE)) as { panelPresent: boolean; panelText: string | null; forgetButtons: Array<{ label: string; visible: boolean }>; editButtonCount: number };
  const after = await (await api.get(`${BASE}/api/memory`)).json();

  // And after a reload — the writer's own "did that stick?" check.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);
  const anchor2 = page.getByText("Writer Memory", { exact: true }).first();
  await anchor2.waitFor({ timeout: 60000 }).catch(() => {});
  await anchor2.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/47e4-after-reload.png`, fullPage: false });
  const panelAfterReload = (await page.evaluate(PANEL_STATE)) as { panelPresent: boolean; panelText: string | null; forgetButtons: Array<{ label: string; visible: boolean }> };

  const report = {
    shot: "47e",
    persona: "P1 (Maya)",
    proves: "D-171 WriterMemoryPanel mounted on /settings with real rows + a revoke that lands (DELETE 200, row gone from panel and API); doubles as the D-184 hand-pruning demo",
    revokedId: REVOKE_ID,
    revokedContent: target.content,
    apiBefore: (before as Array<{ id: string; content: string; category: string; source: string; bookId?: string | null }>).map((m) => ({ id: m.id, category: m.category, source: m.source, bookId: m.bookId ?? null, content: m.content })),
    apiAfter: (after as Array<{ id: string; content: string }>).map((m) => ({ id: m.id, content: m.content })),
    panelBefore: { present: panelBefore.panelPresent, rowsWithForgetButton: panelBefore.forgetButtons.length, forgetButtonsVisible: panelBefore.forgetButtons.every((b) => b.visible), editButtonCount: panelBefore.editButtonCount, text: panelBefore.panelText },
    panelAfter: { present: panelAfter.panelPresent, rowsWithForgetButton: panelAfter.forgetButtons.length, text: panelAfter.panelText },
    panelAfterReload: { present: panelAfterReload.panelPresent, rowsWithForgetButton: panelAfterReload.forgetButtons.length, stillShowsRevoked: (panelAfterReload.panelText ?? "").includes(target.content), text: panelAfterReload.panelText },
    settleTimeline,
    revokeButton: { found: btnCount > 0, visibleWithoutHover: btnVisible },
    networkAll: netLog,
    network: netLog.filter((l) => (l.at as number) >= tClick),
    verdict: {
      panelMountedOnSettings: panelBefore.panelPresent,
      rowsAreReal: (before as unknown[]).length > 0 && panelBefore.forgetButtons.length === (before as unknown[]).length,
      revokeReachableWithoutHover: btnVisible,
      deleteReturned200: netLog.some((l) => l.phase === "response" && l.method === "DELETE" && l.status === 200),
      rowGoneFromApi: !(after as Array<{ id: string }>).some((m) => m.id === REVOKE_ID),
      rowGoneFromPanel: !(panelAfter.panelText ?? "").includes(target.content),
      panelRowCountDropped: panelAfter.forgetButtons.length === panelBefore.forgetButtons.length - 1,
      rowGoneAfterReload: !panelAfterReload.forgetButtons.some((b) => b.label.includes(target.content)),
      panelSelfUpdatedWithoutReload: settleTimeline.some((s) => !s.panelHasRow),
      msUntilPanelDroppedRow: settleTimeline.find((s) => !s.panelHasRow)?.atMs ?? null,
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/47e-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, revokeButton: report.revokeButton, network: report.network, apiBeforeCount: (before as unknown[]).length, apiAfterCount: (after as unknown[]).length }, null, 2));
  await browser.close();
})();
