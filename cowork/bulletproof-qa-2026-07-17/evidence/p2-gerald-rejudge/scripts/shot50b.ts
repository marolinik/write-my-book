/**
 * 50b — D-190 / D-115 deleted-chapter prose resurrection guard, ON CAMERA as P2.
 *
 * Drill on the scratch book created by 50c (no persona fixture is touched):
 *   1. write sentinel prose into Chapter 1 (creates the CHAPTER_CONTENT row),
 *   2. DELETE Chapter 1 — the document row survives (no chapterId column),
 *   3. create a new chapter at the freed number 1,
 *   4. GET content -> must be withheld (empty, no id/version to stamp),
 *   5. open the editor in a browser -> the new chapter must be BLANK in pixels,
 *   6. type fresh prose and let the editor's own autosave fire -> the first
 *      save must be 200 (the pre-fix phantom 409 leaked the deleted prose back
 *      through `serverContent`), and the reclaim must be labelled,
 *   7. reload -> only the new prose survives; the sentinel never returns.
 *
 * HARNESS NOTE: in-page snippets are raw SOURCE STRINGS (esbuild keepNames).
 *
 * Usage: npx tsx --env-file=.env shot50b.ts <bookId> <chapter1Id>
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const BOOK = process.argv[2];
const CH1 = process.argv[3];
if (!BOOK || !CH1) { console.error("usage: shot50b.ts <bookId> <chapter1Id>"); process.exit(1); }
const H: Record<string, string> = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const JSONH = { ...H, "Content-Type": "application/json" };
const OUT = "../shots";
const HIDE = "nextjs-portal{display:none !important}";

const SENTINEL = `ORPHAN-SENTINEL-${Date.now()}`;
const DEAD_PROSE = `The vault door in Zürich closed at four. ${SENTINEL}. Every ledger line after that hour belonged to a chapter that no longer exists.`;
const FRESH_PROSE = "Fresh reclaimed line: this chapter was created after the deleted one and starts empty.";

const INIT = `
(function () {
  var style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none !important}";
  document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });
  window.__b = { puts: [], gets: [] };
  var origFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var input = args[0]; var init = args[1] || {};
    var url = (typeof input === "string" ? input : (input && input.url) || "");
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var isContent = url.indexOf("/content") >= 0;
    var p = origFetch.apply(this, args);
    if (!isContent) return p;
    var body = null;
    try { body = init && typeof init.body === "string" ? init.body.slice(0, 300) : null; } catch (e) {}
    var t0 = Date.now();
    return p.then(function (res) {
      res.clone().text().then(function (txt) {
        var rec = { url: url, method: method, status: res.status, reqBody: body, resBody: txt.slice(0, 500), atMs: Date.now() - t0 };
        (method === "PUT" ? window.__b.puts : window.__b.gets).push(rec);
      }).catch(function () {});
      return res;
    });
  };
})();
`;

const PROBE = `(function(){
  var pm = document.querySelector(".ProseMirror");
  var body = document.body.innerText || "";
  return {
    ms: Math.round(performance.now()),
    editorPresent: !!pm,
    editorText: pm ? (pm.innerText || "") : null,
    editorChars: pm ? (pm.innerText || "").trim().length : null,
    sentinelInEditor: pm ? (pm.innerText || "").indexOf("SENTINELMARK") >= 0 : null,
    sentinelAnywhere: body.indexOf("SENTINELMARK") >= 0,
    conflictVisible: /version_conflict|conflict|newer version/i.test(body),
    statusLine: (body.match(/(Saved[^\\n]*|Saving[^\\n]*|Unsaved[^\\n]*)/) || [])[0] || null,
    wordCountLine: (body.match(/\\d[\\d,]*\\s+words?/) || [])[0] || null
  };
})()`.replace(/SENTINELMARK/g, SENTINEL);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* text stays */ }
  return { status: res.status, body: json ?? text.slice(0, 400) };
}
function log(m: string) { console.log(`[50b] ${m}`); }

(async () => {
  const trace: any = { shot: "50b", defect: "D-190/D-115", persona: "user_qa_p2", book: BOOK, sentinel: SENTINEL, capturedAt: new Date().toISOString() };

  // 1. sentinel prose into Chapter 1
  trace.step1_writeDeadProse = await api(`/api/books/${BOOK}/chapters/${CH1}/content`, {
    method: "PUT", headers: JSONH, body: JSON.stringify({ markdown: DEAD_PROSE }),
  });
  log(`1 PUT dead prose -> ${trace.step1_writeDeadProse.status}`);

  // 2. delete Chapter 1
  trace.step2_deleteChapter = await api(`/api/books/${BOOK}/chapters/${CH1}`, { method: "DELETE", headers: H });
  log(`2 DELETE chapter1 -> ${trace.step2_deleteChapter.status}`);

  // 3. new chapter at the freed number
  trace.step3_createChapter = await api(`/api/books/${BOOK}/chapters`, {
    method: "POST", headers: JSONH,
    body: JSON.stringify({ actNumber: 1, chapterNumber: 1, title: "Reclaimed Chapter" }),
  });
  const newCh = trace.step3_createChapter.body?.id as string | undefined;
  log(`3 POST chapter -> ${trace.step3_createChapter.status} id=${newCh}`);
  if (!newCh) { writeFileSync(`${OUT}/50b-assertions.json`, JSON.stringify({ ...trace, verdict: "BLOCKED: no new chapter id" }, null, 2)); return; }
  trace.newChapterId = newCh;

  // 4. server-side GET must withhold the orphan
  const g = await api(`/api/books/${BOOK}/chapters/${newCh}/content`, { headers: H });
  trace.step4_getContent = g;
  trace.step4_withheld = g.status === 200 && (g.body?.markdown ?? "") === "" && !JSON.stringify(g.body).includes(SENTINEL);
  log(`4 GET content -> ${g.status} withheld=${trace.step4_withheld}`);

  // 5-7. pixels
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));

  await page.goto(`${BASE}/books/${BOOK}/chapters/${newCh}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(9000);
  trace.step5_emptyEditor = await page.evaluate(PROBE);
  await page.screenshot({ path: `${OUT}/50b1-new-chapter-empty.png`, fullPage: false });
  log(`5 editor chars=${trace.step5_emptyEditor.editorChars} sentinelAnywhere=${trace.step5_emptyEditor.sentinelAnywhere}`);

  // 6. type fresh prose, let the editor's own autosave fire
  const pm = page.locator(".ProseMirror").first();
  if (await pm.count()) {
    await pm.click();
    await page.keyboard.type(FRESH_PROSE, { delay: 12 });
    await page.waitForTimeout(12000);
  } else {
    trace.step6_note = "no .ProseMirror surface found — typing skipped";
  }
  trace.step6_afterTyping = await page.evaluate(PROBE);
  trace.step6_contentCalls = await page.evaluate(`(function(){ return window.__b ? window.__b : null; })()`);
  await page.screenshot({ path: `${OUT}/50b2-after-typing-saved.png`, fullPage: false });
  const puts = trace.step6_contentCalls?.puts ?? [];
  trace.step6_putStatuses = puts.map((p: any) => p.status);
  trace.step6_no409 = puts.length > 0 && puts.every((p: any) => p.status !== 409);
  trace.step6_serverContentLeak = JSON.stringify(puts).includes(SENTINEL);
  log(`6 PUT statuses=${JSON.stringify(trace.step6_putStatuses)} no409=${trace.step6_no409} leak=${trace.step6_serverContentLeak}`);

  // 7. reload — only the new prose survives
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(9000);
  trace.step7_afterReload = await page.evaluate(PROBE);
  await page.screenshot({ path: `${OUT}/50b3-after-reload-persisted.png`, fullPage: false });
  trace.pageErrors = pageErrors;
  await browser.close();

  const g2 = await api(`/api/books/${BOOK}/chapters/${newCh}/content`, { headers: H });
  trace.step7_getAfterSave = g2;
  trace.step7_sentinelGone = !JSON.stringify(g2.body).includes(SENTINEL);
  trace.step7_freshPresent = JSON.stringify(g2.body).includes("Fresh reclaimed line");
  log(`7 GET -> ${g2.status} sentinelGone=${trace.step7_sentinelGone} freshPresent=${trace.step7_freshPresent}`);

  trace.verdict = {
    withheldOnGet: trace.step4_withheld,
    blankInPixels: trace.step5_emptyEditor.editorChars === 0 && trace.step5_emptyEditor.sentinelAnywhere === false,
    firstSaveNot409: trace.step6_no409,
    noServerContentLeak: !trace.step6_serverContentLeak,
    sentinelGoneAfterSave: trace.step7_sentinelGone,
    freshProsePersisted: trace.step7_freshPresent,
  };
  writeFileSync(`${OUT}/50b-assertions.json`, JSON.stringify(trace, null, 2));
  log(`VERDICT ${JSON.stringify(trace.verdict)}`);
})();
