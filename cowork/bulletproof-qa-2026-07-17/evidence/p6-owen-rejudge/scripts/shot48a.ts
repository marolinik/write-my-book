/**
 * Shot 48a — the D-176 wait chrome on OWEN'S OWN screen, in Owen's own book.
 *
 * The P6 v3 panel's standing objection to the discuss evidence was that it was
 * *transferred* from P1: P6's own discuss leg (45d) was a single blocking 61.6 s
 * POST with a spinner. So this shot repeats the P1 47a proof end-to-end as
 * `user_qa_p6` on `The Keeper's Arithmetic` — counter climbing, phase band
 * changing, heartbeat, Cancel, token stream, settle — and compares three clocks
 * (Server-Timing `ttft`, first SSE `text` frame, the rendered counter).
 *
 * ttft is reported exactly as measured, however long it is.
 *
 * Usage: npx tsx --env-file=.env shot48a.ts <outDir> <bookId> <findingId>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE, INIT_SCRIPT, RESET_SAMPLES, LIVE_STATE, DUMP_SAMPLES, CARD_STATE, parseCounter, parseTtftHeader } from "./shot48-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, FINDING] = process.argv.slice(2);
if (!outDir || !BOOK || !FINDING) { console.error("usage: <outDir> <bookId> <findingId>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p6" };

/** Owen defends a device — the stylist's actual reason to open a thread at all. */
const MESSAGE =
  "The echo is the point: the clipboard and the clipped voice are the same gesture twice, one object and one habit. Show me a version that keeps that pairing if you think it can be tighter.";

const WAIT_MARKS = [2, 10, 25];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT_SCRIPT });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];
  const discussUrl = `${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`;

  for (const [k, u] of [["discuss-get", discussUrl], ["editorial-page", `${BASE}/books/${BOOK}/editorial`]] as const) {
    const t = Date.now();
    const r = await api.get(u);
    trace.push({ step: `warm-${k}`, status: r.status(), ms: Date.now() - t });
  }
  const pre = await (await api.get(discussUrl)).json();
  trace.push({ step: "pre-state", userTurns: pre.userTurns, canDiscuss: pre.canDiscuss, replies: pre.replies?.length });

  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));
  const netLog: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    if (r.url().includes("/discuss")) netLog.push({ at: Date.now(), method: r.request().method(), status: r.status(), contentType: r.headers()["content-type"] ?? null, serverTiming: r.headers()["server-timing"] ?? null });
  });

  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const card = page.locator(`#finding-card-${FINDING}`);
  await card.waitFor({ state: "visible", timeout: 180000 });
  await page.waitForTimeout(3000);
  await card.scrollIntoViewIfNeeded();
  const discussBtn = card.getByRole("button", { name: /Discuss|Hide/ }).first();
  await discussBtn.waitFor({ timeout: 60000 });
  if (/Discuss/.test((await discussBtn.innerText()).trim())) await discussBtn.click();
  await page.waitForTimeout(2500);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/48a0-thread-open.png`, fullPage: false });

  const box = card.locator("textarea").first();
  await box.waitFor({ timeout: 30000 });
  await box.fill(MESSAGE);
  await page.waitForTimeout(400);
  await page.evaluate(RESET_SAMPLES);

  const tSend = Date.now();
  await box.press("Enter");

  const marksTaken: Array<{ mark: number; atMs: number; counter: string | null; label: string; hint: string | null }> = [];
  const pending = [...WAIT_MARKS];
  let phaseFlip: Record<string, unknown> | null = null;
  let lastLabel: string | null = null;
  let firstProseMs: number | null = null;
  let midShot = false;
  let settledAtMs: number | null = null;

  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const st = (await page.evaluate(LIVE_STATE)) as { live: boolean; text: string | null; waiting: boolean; counter: string | null; hint: string | null; proseLen: number };
    const elapsedMs = Date.now() - tSend;
    if (st.live && st.waiting) {
      const label = (st.text ?? "").replace(/\s+\d+m?\s*\d*s\s*$/, "").trim();
      if (lastLabel && label && label !== lastLabel && !phaseFlip) {
        await page.screenshot({ path: `${outDir}/48a2-wait-phase-flip.png`, fullPage: false });
        phaseFlip = { atMs: elapsedMs, from: lastLabel, to: label, counter: st.counter, hint: st.hint };
      }
      lastLabel = label || lastLabel;
      while (pending.length && elapsedMs / 1000 >= pending[0]) {
        const mark = pending.shift() as number;
        await page.screenshot({ path: `${outDir}/48a1-wait-${mark}s.png`, fullPage: false });
        marksTaken.push({ mark, atMs: elapsedMs, counter: st.counter, label, hint: st.hint });
      }
    }
    if (st.proseLen > 0 && firstProseMs === null) {
      firstProseMs = elapsedMs;
      await page.screenshot({ path: `${outDir}/48a3-first-prose.png`, fullPage: false });
    }
    if (st.proseLen > 80 && !midShot) { await page.screenshot({ path: `${outDir}/48a4-midstream.png`, fullPage: false }); midShot = true; }
    if (!st.live && firstProseMs !== null) { settledAtMs = elapsedMs; break; }
    if (!st.live && elapsedMs > 20000 && firstProseMs === null) { trace.push({ step: "turn-vanished-without-prose", elapsedMs }); break; }
    await page.waitForTimeout(40);
  }

  await page.waitForTimeout(2500);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${outDir}/48a5-settled.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/48a5-settled-full.png`, fullPage: true });

  const dump = (await page.evaluate(DUMP_SAMPLES)) as {
    samples: Array<{ tMs: number; live: boolean; waiting: boolean; counter: string | null; hint: string | null; liveLen: number; settledCount: number }>;
    violations: unknown[];
    turns: Array<{ headers: { status?: number; contentType?: string | null; serverTiming?: string | null } | null; frames: Array<{ tMs: number; raw: string }>; endMs: number | null }>;
  };
  const cardState = (await page.evaluate(CARD_STATE)) as Record<string, unknown>;
  const post = await (await api.get(discussUrl)).json();

  const rec = dump.turns[dump.turns.length - 1] ?? null;
  const events: Array<{ tMs: number; type: string; text?: string }> = [];
  for (const f of rec?.frames ?? []) {
    for (const line of f.raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      try {
        const j = JSON.parse(t.slice(5).trim()) as { type: string; text?: string };
        events.push({ tMs: f.tMs, type: j.type, text: j.type === "text" ? j.text : undefined });
      } catch { /* split frame */ }
    }
  }
  const textEvents = events.filter((e) => e.type === "text");
  const gaps = textEvents.slice(1).map((e, i) => Math.round(e.tMs - textEvents[i].tMs));
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const ttftHeaderMs = parseTtftHeader(rec?.headers?.serverTiming ?? null);
  const waitingSamples = dump.samples.filter((s) => s.live && s.waiting && s.counter);
  const counterAtFirstProse = waitingSamples.length ? waitingSamples[waitingSamples.length - 1].counter : null;
  const preSettled = dump.samples.length ? dump.samples[0].settledCount : 0;
  const firstNewReplyIdx = dump.samples.findIndex((s) => s.settledCount > preSettled);
  const d177Violations = dump.samples.map((s, i) => ({ i, ...s })).filter((s) => firstNewReplyIdx >= 0 && s.i >= firstNewReplyIdx && s.live && s.waiting);

  const report = {
    shot: "48a",
    persona: "P6 (Owen)", book: BOOK, finding: FINDING,
    proves: "D-176 wait chrome on P6's own surface (no transferred evidence): counter, phase bands, heartbeat, Cancel, token stream, honest settle",
    writerMessage: MESSAGE,
    network: netLog.filter((l) => (l.at as number) >= tSend),
    streamHeaders: rec?.headers ?? null,
    isSse: /text\/event-stream/.test(String(rec?.headers?.contentType ?? "")),
    clocks: {
      ttftHeaderMs,
      ttftFirstTextFrameMs: textEvents.length ? Math.round(textEvents[0].tMs) : null,
      firstProseInDomMs: firstProseMs,
      counterAtFirstProse,
      counterSecondsAtFirstProse: parseCounter(counterAtFirstProse),
      agreeWithin1s: ttftHeaderMs != null && parseCounter(counterAtFirstProse) != null ? Math.abs(ttftHeaderMs / 1000 - (parseCounter(counterAtFirstProse) as number)) <= 1.0 : null,
      settledAtMs,
      medianInterTokenGapMs: sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null,
      streamSpanMs: textEvents.length > 1 ? Math.round(textEvents[textEvents.length - 1].tMs - textEvents[0].tMs) : 0,
    },
    counterSeries: waitingSamples.map((s) => s.counter).filter((c, i, a) => c !== a[i - 1]),
    waitMarks: marksTaken,
    phaseFlip,
    hintsSeen: Array.from(new Set(waitingSamples.map((s) => s.hint).filter(Boolean))),
    textFrameCount: textEvents.length,
    frameTypes: events.map((e) => e.type),
    streamedText: textEvents.map((e) => e.text ?? "").join(""),
    d177: { violations: d177Violations, clean: d177Violations.length === 0 },
    rawSyntaxViolations: dump.violations,
    cardState,
    threadState: { userTurnsBefore: pre.userTurns, userTurnsAfter: post.userTurns, repliesBefore: pre.replies?.length ?? 0, repliesAfter: post.replies?.length ?? 0, canDiscussAfter: post.canDiscuss },
    domSamples: dump.samples,
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/48a-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    isSse: report.isSse, clocks: report.clocks, waitMarks: marksTaken.map((m) => `${m.mark}s→${m.counter}`),
    phaseFlip, hints: report.hintsSeen, counterSeries: report.counterSeries.slice(0, 4).concat(["…"], report.counterSeries.slice(-2)),
    textFrames: report.textFrameCount, d177clean: report.d177.clean, thread: report.threadState, violations: report.rawSyntaxViolations.length,
  }, null, 2));
  await browser.close();
})();
