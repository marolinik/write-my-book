/**
 * Shot 45c — ONE live line-edit on Anthropic Opus (BYOK), with stream cadence.
 *
 * modelEditor is set to `anthropic/opus` on the book BEFORE this runs (see the
 * capture doc for the PATCH), so the line-editor specialist resolves from
 * "book-role" -> anthropic/opus. Drives the real UI: FAB -> mini panel ->
 * all workflows -> Line Edit -> chapter -> Start, then records
 *   - every SSE frame the browser receives (type + t + size), i.e. real cadence
 *   - the panel's visible text growth over time (perceived cadence)
 *   - wall-clock to first frame / first visible text / completion.
 *
 * Usage: npx tsx --env-file=.env shot45c.ts <outDir> <bookId> <chapterId> <chapterNumber>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p6";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, CHAPTER, CHNUM] = process.argv.slice(2);
if (!outDir || !BOOK || !CHAPTER || !CHNUM) { console.error("usage: <outDir> <bookId> <chapterId> <chapterNumber>"); process.exit(1); }
const HIDE = "nextjs-portal{display:none !important}";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };
const MAX_WAIT_MS = 480000;

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
    // Instrument SSE so stream cadence is measured, not asserted.
    const w = window as unknown as { __sse: Array<Record<string, unknown>>; EventSource: typeof EventSource };
    w.__sse = [];
    const Native = w.EventSource;
    function Wrapped(this: unknown, url: string, cfg?: EventSourceInit) {
      const es = new Native(url, cfg);
      w.__sse.push({ t: Date.now(), kind: "open", url: String(url) });
      es.addEventListener("message", (ev: MessageEvent) => {
        let type = "?";
        let contentLen = 0;
        try {
          const p = JSON.parse(ev.data);
          type = p.type ?? "?";
          contentLen = typeof p.content === "string" ? p.content.length : 0;
        } catch { /* keepalive or partial */ }
        w.__sse.push({ t: Date.now(), kind: "message", type, bytes: ev.data.length, contentLen, head: String(ev.data).slice(0, 160) });
      });
      es.addEventListener("error", () => w.__sse.push({ t: Date.now(), kind: "error" }));
      return es;
    }
    Wrapped.prototype = Native.prototype;
    (w as unknown as { EventSource: unknown }).EventSource = Wrapped;
  });

  const api = ctx.request;
  const preflight = await api.get(BASE + "/api/books/" + BOOK + "/cost-estimate?workflowId=line-edit");
  const preflightBody = await preflight.json();
  // ENV-01 warm
  const warmT = Date.now();
  await api.get(BASE + "/books/" + BOOK + "/chapters/" + CHAPTER);
  const warmMs = Date.now() - warmT;

  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.indexOf("/api/books/") >= 0 && (u.indexOf("/agent") >= 0 || u.indexOf("/usage") >= 0)) {
      net.push({ t: Date.now(), url: u.replace(BASE, ""), method: r.request().method(), status: r.status() });
    }
  });

  await page.goto(BASE + "/books/" + BOOK + "/chapters/" + CHAPTER, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator("div.ProseMirror").first().waitFor({ state: "visible", timeout: 120000 });
  await page.waitForTimeout(6000);

  // Open the agent: FAB -> mini panel -> all workflows
  await page.locator('button[title="Open Writing Agent"]').first().click();
  await page.waitForTimeout(1200);
  const allWf = page.getByRole("button", { name: /All workflows/ });
  if ((await allWf.count()) > 0) { await allWf.first().click(); await page.waitForTimeout(2500); }
  const browseAll = page.getByRole("button", { name: /Browse all workflows/ });
  if ((await browseAll.count()) > 0) { await browseAll.first().click(); await page.waitForTimeout(1500); }
  await page.screenshot({ path: outDir + "/45c1-workflow-picker.png", fullPage: false });

  const lineEdit = page.getByRole("button", { name: /^Line Edit/ });
  await lineEdit.first().waitFor({ timeout: 30000 });
  await lineEdit.first().click();
  await page.waitForTimeout(1200);
  const chBtn = page.getByRole("button", { name: new RegExp("^Ch " + CHNUM + "\\b") });
  await chBtn.first().waitFor({ timeout: 20000 });
  await chBtn.first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: outDir + "/45c2-chapter-selected.png", fullPage: false });

  const startBtn = page.getByRole("button", { name: /^Start$/ });
  await startBtn.first().waitFor({ timeout: 20000 });
  const t0 = Date.now();
  await startBtn.first().click();

  // Sample perceived text + SSE frames until completion.
  const samples: Array<{ t: number; len: number }> = [];
  let firstFrameMs: number | null = null;
  let firstTextMs: number | null = null;
  let completeMs: number | null = null;
  let midShot = false;
  while (Date.now() - t0 < MAX_WAIT_MS) {
    const snap = await page.evaluate(() => {
      const w = window as unknown as { __sse: Array<Record<string, unknown>> };
      const panel = document.querySelector('[role="dialog"], [data-slot="sheet-content"]') as HTMLElement | null;
      return {
        sse: w.__sse ? w.__sse.length : 0,
        events: w.__sse ?? [],
        panelLen: panel ? panel.innerText.length : 0,
      };
    });
    samples.push({ t: Date.now() - t0, len: snap.panelLen });
    const msgs = (snap.events as Array<Record<string, unknown>>).filter((e) => e.kind === "message");
    if (firstFrameMs === null && msgs.length > 0) firstFrameMs = (msgs[0].t as number) - t0;
    const withText = msgs.filter((e) => (e.contentLen as number) > 0);
    if (firstTextMs === null && withText.length > 0) firstTextMs = (withText[0].t as number) - t0;
    if (!midShot && withText.length >= 2) {
      await page.screenshot({ path: outDir + "/45c3-midstream.png", fullPage: false });
      midShot = true;
    }
    const done = msgs.find((e) => e.type === "complete" || e.type === "error");
    if (done) { completeMs = (done.t as number) - t0; break; }
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(4000);
  await page.screenshot({ path: outDir + "/45c4-settled.png", fullPage: false });
  await page.screenshot({ path: outDir + "/45c4-settled-full.png", fullPage: true });

  const events = await page.evaluate(() => {
    const w = window as unknown as { __sse: Array<Record<string, unknown>> };
    return w.__sse ?? [];
  });
  const panelText = await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"], [data-slot="sheet-content"]') as HTMLElement | null;
    return panel ? panel.innerText.slice(0, 4000) : (document.body as HTMLElement).innerText.slice(0, 4000);
  });

  const rel = (events as Array<Record<string, unknown>>).map((e) => ({ ...e, tMs: (e.t as number) - t0 }));
  const textFrames = rel.filter((e) => e.kind === "message" && (e.contentLen as number) > 0);
  const gaps: number[] = [];
  for (let i = 1; i < textFrames.length; i++) gaps.push((textFrames[i].tMs as number) - (textFrames[i - 1].tMs as number));

  const report = {
    shot: "45c",
    book: BOOK,
    chapter: CHAPTER,
    chapterNumber: Number(CHNUM),
    preflightCostEstimate: preflightBody,
    warmMs,
    timings: { firstFrameMs, firstTextMs, completeMs, totalSampledMs: samples.length ? samples[samples.length - 1].t : null },
    cadence: {
      frameCount: rel.filter((e) => e.kind === "message").length,
      textFrameCount: textFrames.length,
      gapMsMin: gaps.length ? Math.min(...gaps) : null,
      gapMsMedian: gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null,
      gapMsMax: gaps.length ? Math.max(...gaps) : null,
      gaps,
    },
    events: rel,
    perceivedTextSamples: samples,
    panelText,
    network: net.map((n) => ({ url: n.url, method: n.method, status: n.status, tMs: (n.t as number) - t0 })),
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(outDir + "/45c-assertions.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ preflight: preflightBody.resolvedModel, cost: preflightBody.costEstimate, timings: report.timings, cadence: { frames: report.cadence.frameCount, textFrames: report.cadence.textFrameCount, min: report.cadence.gapMsMin, med: report.cadence.gapMsMedian, max: report.cadence.gapMsMax } }, null, 2));
  console.log("--- panel tail ---\n" + panelText.slice(-1200));
  await browser.close();
})();
