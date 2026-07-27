/**
 * Shot 47a — the D-176 wait chrome on camera, and the D-177 settle sampled at 25 ms.
 *
 * One real streamed discuss turn. Frames are taken *by elapsed time*, not by luck:
 * ~2 s (band 1), the instant the phase text flips (8 s), ~25 s, then first prose,
 * then settled. Three clocks are compared afterwards:
 *
 *   `Server-Timing: ttft;dur=` (server)  vs
 *   first `text` SSE frame from the tee (network)  vs
 *   the elapsed counter as RENDERED at the last waiting sample (writer's screen)
 *
 * D-177 is decided by the 25 ms sampler alone: no sample may show the waiting line
 * once a settled assistant reply exists.
 *
 * Usage: npx tsx --env-file=.env shot47a.ts <outDir> <bookId> <findingId> [messageIndex]
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import {
  BASE, HIDE, INIT_SCRIPT, RESET_SAMPLES, LIVE_STATE, DUMP_SAMPLES, CARD_STATE,
  parseCounter, parseTtftHeader,
} from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, FINDING, msgArg, shotPrefixArg] = process.argv.slice(2);
if (!outDir || !BOOK || !FINDING) { console.error("usage: <outDir> <bookId> <findingId> [messageIndex] [shotPrefix]"); process.exit(1); }
const MSG_INDEX = Number(msgArg ?? "0");
const PREFIX = shotPrefixArg ?? "47a";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };

const MESSAGES = [
  // 0 — invites a revision, so the same turn also arms the D-185 card.
  "The tense shift is not deliberate here — I just missed it. Show me your tighter version of that sentence so I can compare.",
  // 1 — a closing question that must NOT carry a revision (keeps D-185's anchor on turn 1).
  "Thanks. In one sentence, what would you watch for in the rest of the chapter if I take that fix?",
];
const MESSAGE = MESSAGES[Math.min(MSG_INDEX, MESSAGES.length - 1)];

/** Elapsed-second marks we want a frame at while the wait is still on screen. */
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

  const box = card.locator("textarea").first();
  await box.waitFor({ timeout: 30000 });
  await box.fill(MESSAGE);
  await page.waitForTimeout(400);
  await page.evaluate(RESET_SAMPLES);

  const tSend = Date.now();
  await box.press("Enter");

  const marksTaken: Array<{ mark: number; atMs: number; counter: string | null; label: string | null; hint: string | null }> = [];
  const pending = [...WAIT_MARKS];
  let phaseFlipShot: Record<string, unknown> | null = null;
  let lastLabel: string | null = null;
  let firstProseMs: number | null = null;
  let counterAtFirstProse: string | null = null;
  let midShot = false;
  let settledAtMs: number | null = null;

  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const st = (await page.evaluate(LIVE_STATE)) as { live: boolean; text: string | null; waiting: boolean; counter: string | null; hint: string | null; proseLen: number };
    const elapsedMs = Date.now() - tSend;
    const elapsedS = elapsedMs / 1000;

    if (st.live && st.waiting) {
      const label = (st.text ?? "").replace(/\s+\d+m?\s*\d*s\s*$/, "").trim();
      // The 8 s phase flip: shoot the very first frame that carries the new label.
      if (lastLabel && label && label !== lastLabel && !phaseFlipShot) {
        await page.screenshot({ path: `${outDir}/${PREFIX}2-wait-phase-flip.png`, fullPage: false });
        phaseFlipShot = { atMs: elapsedMs, from: lastLabel, to: label, counter: st.counter, hint: st.hint };
      }
      lastLabel = label || lastLabel;

      while (pending.length && elapsedS >= pending[0]) {
        const mark = pending.shift() as number;
        await page.screenshot({ path: `${outDir}/${PREFIX}1-wait-${mark}s.png`, fullPage: false });
        marksTaken.push({ mark, atMs: elapsedMs, counter: st.counter, label, hint: st.hint });
      }
    }

    if (st.proseLen > 0 && firstProseMs === null) {
      firstProseMs = elapsedMs;
      await page.screenshot({ path: `${outDir}/${PREFIX}3-first-prose.png`, fullPage: false });
    }
    if (st.proseLen > 80 && !midShot) {
      await page.screenshot({ path: `${outDir}/${PREFIX}4-midstream.png`, fullPage: false });
      midShot = true;
    }
    if (!st.live && firstProseMs !== null) { settledAtMs = elapsedMs; break; }
    if (!st.live && elapsedMs > 20000 && firstProseMs === null) { trace.push({ step: "turn-vanished-without-prose", elapsedMs }); break; }
    await page.waitForTimeout(40);
  }

  await page.waitForTimeout(2500);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${outDir}/${PREFIX}5-settled.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/${PREFIX}5-settled-full.png`, fullPage: true });

  const dump = (await page.evaluate(DUMP_SAMPLES)) as {
    samples: Array<{ tMs: number; live: boolean; waiting: boolean; counter: string | null; settledCount: number; liveLen: number; liveHead: string | null; hint: string | null; composer: { value: string; disabled: boolean } | null }>;
    violations: unknown[];
    turns: Array<{ headers: { status?: number; contentType?: string | null; serverTiming?: string | null; tMs?: number } | null; endMs: number | null; readError: string | null; rejected: unknown; frames: Array<{ tMs: number; raw: string }> }>;
  };
  const cardState = (await page.evaluate(CARD_STATE)) as Record<string, unknown>;
  const post = await (await api.get(discussUrl)).json();

  // --- network clock: first `text` SSE frame from the tee ---
  const rec = dump.turns[dump.turns.length - 1] ?? null;
  const events: Array<{ tMs: number; type: string; text?: string }> = [];
  for (const f of rec?.frames ?? []) {
    for (const line of f.raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      try {
        const j = JSON.parse(t.slice(5).trim()) as { type: string; text?: string };
        events.push({ tMs: f.tMs, type: j.type, text: j.type === "text" ? j.text : undefined });
      } catch { /* frame split across chunks */ }
    }
  }
  const textEvents = events.filter((e) => e.type === "text");
  const ttftHeaderMs = parseTtftHeader(rec?.headers?.serverTiming ?? null);
  const ttftTeeMs = textEvents.length ? Math.round(textEvents[0].tMs) : null;

  // --- writer's clock: the counter as rendered at the LAST waiting sample ---
  const waitingSamples = dump.samples.filter((s) => s.live && s.waiting && s.counter);
  const lastWaiting = waitingSamples.length ? waitingSamples[waitingSamples.length - 1] : null;
  const counterSecondsAtFirstProse = parseCounter(lastWaiting?.counter ?? null);
  counterAtFirstProse = lastWaiting?.counter ?? null;
  const counterSeries = waitingSamples.map((s) => s.counter).filter((c, i, a) => c !== a[i - 1]);

  // --- D-177: no waiting line once a settled reply exists ---
  const preSettled = dump.samples.length ? dump.samples[0].settledCount : 0;
  const finalSettled = dump.samples.length ? dump.samples[dump.samples.length - 1].settledCount : 0;
  const firstSampleWithNewReply = dump.samples.findIndex((s) => s.settledCount > preSettled);
  const d177Violations = dump.samples
    .map((s, i) => ({ i, ...s }))
    .filter((s) => firstSampleWithNewReply >= 0 && s.i >= firstSampleWithNewReply && s.live && s.waiting);
  // Also: once prose is on screen, the waiting line must never come back.
  const firstProseSample = dump.samples.findIndex((s) => s.live && !s.waiting && s.liveLen > 0);
  const waitingAfterProse = dump.samples
    .map((s, i) => ({ i, ...s }))
    .filter((s) => firstProseSample >= 0 && s.i > firstProseSample && s.waiting);

  const report = {
    shot: PREFIX,
    persona: "P1 (Maya)", book: BOOK, finding: FINDING,
    proves: "D-176 wait chrome (counter climbs, phase flips, heartbeat, Cancel) + ttft agreement + D-177 settle sampled at 25ms",
    writerMessage: MESSAGE,
    network: netLog.filter((l) => (l.at as number) >= tSend),
    streamHeaders: rec?.headers ?? null,
    isSse: /text\/event-stream/.test(String(rec?.headers?.contentType ?? "")),
    clocks: {
      ttftHeaderMs,
      ttftFirstTextFrameMs: ttftTeeMs,
      firstProseInDomMs: firstProseMs,
      counterAtFirstProse,
      counterSecondsAtFirstProse,
      headerVsCounterDeltaMs: ttftHeaderMs != null && counterSecondsAtFirstProse != null ? ttftHeaderMs - counterSecondsAtFirstProse * 1000 : null,
      agreeWithin1s: ttftHeaderMs != null && counterSecondsAtFirstProse != null
        ? Math.abs(ttftHeaderMs / 1000 - counterSecondsAtFirstProse) <= 1.0 : null,
      settledAtMs,
      settleTailAfterLastTextMs: (() => {
        const done = events.find((e) => e.type === "done");
        const last = textEvents[textEvents.length - 1];
        return done && last ? Math.round(done.tMs - last.tMs) : null;
      })(),
    },
    counterSeries,
    waitMarks: marksTaken,
    phaseFlip: phaseFlipShot,
    heartbeatHintSeen: waitingSamples.some((s) => !!s.hint),
    hintsSeen: Array.from(new Set(waitingSamples.map((s) => s.hint).filter(Boolean))),
    composerDuringTurn: Array.from(new Set(dump.samples.filter((s) => s.live).map((s) => `${s.composer?.value.length ?? -1}:${s.composer?.disabled}`))),
    d177: {
      preSettledCount: preSettled,
      finalSettledCount: finalSettled,
      firstSampleIndexWithNewReply: firstSampleWithNewReply,
      violationsCoexisting: d177Violations,
      waitingLineAfterProse: waitingAfterProse,
      clean: d177Violations.length === 0 && waitingAfterProse.length === 0,
    },
    streamedText: textEvents.map((e) => e.text ?? "").join(""),
    textFrameCount: textEvents.length,
    frameTypes: events.map((e) => e.type),
    rawSyntaxViolations: dump.violations,
    cardState,
    threadState: { userTurnsBefore: pre.userTurns, userTurnsAfter: post.userTurns, repliesBefore: pre.replies?.length ?? 0, repliesAfter: post.replies?.length ?? 0, canDiscussAfter: post.canDiscuss },
    domSamples: dump.samples,
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/${PREFIX}-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    isSse: report.isSse, clocks: report.clocks, counterSeries: report.counterSeries.slice(0, 6).concat(["…"], report.counterSeries.slice(-3)),
    waitMarks: report.waitMarks.map((m) => `${m.mark}s→${m.counter}`), phaseFlip: report.phaseFlip,
    hints: report.hintsSeen, d177clean: report.d177.clean, textFrames: report.textFrameCount,
    thread: report.threadState, revisionCard: (cardState as { revisionCardPresent?: boolean }).revisionCardPresent,
    violations: report.rawSyntaxViolations.length,
  }, null, 2));
  await browser.close();
})();
