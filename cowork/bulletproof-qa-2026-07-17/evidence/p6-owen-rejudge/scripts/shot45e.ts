/**
 * Shot 45e — in-editor STREAM CADENCE on camera (P6 D5 floor: "no stream
 * cadence/latency capture ever").
 *
 * Enables AI Ghost Text in the editor toolbar (capturing the point-of-use
 * disclosure tooltip), types into the chapter, and tees the /ghost-text SSE
 * response body so every chunk's arrival time is measured, not asserted:
 * time-to-first-byte, time-to-first-text, per-chunk gaps, settle.
 *
 * Usage: npx tsx --env-file=.env shot45e.ts <outDir> <bookId> <chapterId>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p6";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, CHAPTER] = process.argv.slice(2);
if (!outDir || !BOOK || !CHAPTER) { console.error("usage: <outDir> <bookId> <chapterId>"); process.exit(1); }
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

    const w = window as unknown as { __gt: Array<Record<string, unknown>> };
    w.__gt = [];
    const orig = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
      // The D5 warmup ping (?warmup=1) is a JIT-compile no-op, not a suggestion.
      const isGhost = url.indexOf("/ghost-text") >= 0 && url.indexOf("warmup") < 0;
      if (isGhost) w.__gt.push({ t: Date.now(), kind: "request", url });
      const res = await orig(input as RequestInfo, init);
      if (!isGhost || !res.body) return res;
      w.__gt.push({ t: Date.now(), kind: "headers", status: res.status, ctype: res.headers.get("content-type") });
      const pair = res.body.tee();
      (async () => {
        const rd = pair[1].getReader();
        const dec = new TextDecoder();
        for (;;) {
          const r = await rd.read();
          if (r.done) { w.__gt.push({ t: Date.now(), kind: "end" }); break; }
          const text = dec.decode(r.value, { stream: true });
          w.__gt.push({ t: Date.now(), kind: "chunk", bytes: r.value.length, text: text.slice(0, 240) });
        }
      })();
      return new Response(pair[0], { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  });

  const api = ctx.request;
  // ENV-01 warm, plus the product's own warmup ping target.
  await api.get(BASE + "/books/" + BOOK + "/chapters/" + CHAPTER);

  const page = await ctx.newPage();
  await page.goto(BASE + "/books/" + BOOK + "/chapters/" + CHAPTER, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const pm = page.locator("div.ProseMirror").first();
  await pm.waitFor({ state: "visible", timeout: 120000 });
  await page.waitForTimeout(6000);

  // Point-of-use disclosure on the toggle (D-127 family), then enable.
  const toggle = page.locator('button[aria-label*="Ghost Text"]').first();
  await toggle.waitFor({ timeout: 30000 });
  const labelBefore = await toggle.getAttribute("aria-label");
  await toggle.hover();
  await page.waitForTimeout(900);
  const tooltip = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]'));
    return nodes.map((n) => (n as HTMLElement).innerText).join(" | ");
  });
  await page.screenshot({ path: outDir + "/45e1-ghost-toggle-disclosure.png", fullPage: false });
  await toggle.click();
  await page.waitForTimeout(800);
  const labelAfter = await toggle.getAttribute("aria-label");

  // Land the caret at the end of the prose and type, then pause (1.5s trigger).
  await pm.click();
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window as unknown as { __gt: Array<Record<string, unknown>> };
    w.__gt = [];
  });
  const t0 = Date.now();
  await page.keyboard.type(" The tide was", { delay: 60 });
  const typedAt = Date.now() - t0;

  let ghostShotDone = false;
  const overlaySamples: Array<{ t: number; ghostLen: number }> = [];
  while (Date.now() - t0 < 90000) {
    const snap = await page.evaluate(() => {
      const w = window as unknown as { __gt: Array<Record<string, unknown>> };
      const ghost = document.querySelector('[data-ghost-text], .ghost-text, [class*="ghost"]') as HTMLElement | null;
      return { events: w.__gt ?? [], ghostLen: ghost ? ghost.innerText.length : 0 };
    });
    overlaySamples.push({ t: Date.now() - t0, ghostLen: snap.ghostLen });
    const ev = snap.events as Array<Record<string, unknown>>;
    if (!ghostShotDone && ev.some((e) => e.kind === "chunk")) {
      await page.screenshot({ path: outDir + "/45e2-ghost-streaming.png", fullPage: false });
      ghostShotDone = true;
    }
    if (ev.some((e) => e.kind === "end")) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outDir + "/45e3-ghost-settled.png", fullPage: false });

  const events = (await page.evaluate(() => {
    const w = window as unknown as { __gt: Array<Record<string, unknown>> };
    return w.__gt ?? [];
  })) as Array<Record<string, unknown>>;
  const rel = events.map((e) => ({ ...e, tMs: (e.t as number) - t0 }));
  const chunks = rel.filter((e) => e.kind === "chunk");
  const gaps: number[] = [];
  for (let i = 1; i < chunks.length; i++) gaps.push((chunks[i].tMs as number) - (chunks[i - 1].tMs as number));
  const headers = rel.find((e) => e.kind === "headers");
  const firstTextChunk = chunks.find((e) => String(e.text).indexOf("text") >= 0 || String(e.text).indexOf("delta") >= 0);

  const editorText = await page.evaluate(() => {
    const el = document.querySelector("div.ProseMirror") as HTMLElement | null;
    return el ? el.innerText.slice(-400) : null;
  });

  const report = {
    shot: "45e",
    book: BOOK,
    chapter: CHAPTER,
    toggle: { ariaLabelBefore: labelBefore, ariaLabelAfter: labelAfter, tooltip },
    typedAt,
    stream: {
      requestAtMs: rel.find((e) => e.kind === "request")?.tMs ?? null,
      headersAtMs: headers ? headers.tMs : null,
      status: headers ? headers.status : null,
      contentType: headers ? headers.ctype : null,
      chunkCount: chunks.length,
      firstChunkAtMs: chunks.length ? chunks[0].tMs : null,
      firstTextChunkAtMs: firstTextChunk ? firstTextChunk.tMs : null,
      lastChunkAtMs: chunks.length ? chunks[chunks.length - 1].tMs : null,
      endAtMs: rel.find((e) => e.kind === "end")?.tMs ?? null,
      gapMs: gaps,
      gapMsMedian: gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null,
    },
    events: rel,
    overlaySamples,
    editorTail: editorText,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(outDir + "/45e-assertions.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ toggle: report.toggle, stream: { ...report.stream, gapMs: gaps.slice(0, 20) } }, null, 2));
  await browser.close();
})();
