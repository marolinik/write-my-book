/**
 * Shots 47c + 47d — D-183 (nothing settles mid-turn) and D-185 (the revision card
 * belongs to the turn that emitted it).
 *
 * Sends turn 2 into a thread that already carries a revision from turn 1, so the
 * four settle affordances that D-183 names all exist at once: the thread's
 * `Use it` / `Keep as-is` and the card's own `Apply` / `Dismiss`.
 *
 *   47c1 — a frame mid-turn with all four disabled (+ the title that explains it)
 *   47c2 — a frame right after settle with all four live again
 *   47d  — the settled 2-turn thread: revision card under ITS turn, turn 2 below
 *
 * The disabled→enabled flip is also read off the 25 ms sampler, so the pixels are
 * corroborated by state, and the deliberate exception (`Hide` stays clickable —
 * a writer must always be able to leave) is asserted rather than assumed.
 *
 * Usage: npx tsx --env-file=.env shot47cd.ts <outDir> <bookId> <findingId>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, HIDE, INIT_SCRIPT, RESET_SAMPLES, LIVE_STATE, DUMP_SAMPLES, CARD_STATE, parseCounter, parseTtftHeader } from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, FINDING] = process.argv.slice(2);
if (!outDir || !BOOK || !FINDING) { console.error("usage: <outDir> <bookId> <findingId>"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };

/** Deliberately asks for judgement, NOT a rewrite: the D-185 anchor must stay on turn 1. */
const MESSAGE = "Understood. In one sentence, what would you watch for in the rest of the chapter if I take that fix?";

const CONTROL_STATE = `(function(){
  var want = ["Use it", "Keep as-is", "Apply", "Dismiss", "Hide", "Cancel"];
  var out = {};
  var bs = Array.prototype.slice.call(document.querySelectorAll("button"));
  for (var i = 0; i < want.length; i++) {
    out[want[i]] = { present: false, disabled: null, title: null };
    for (var j = 0; j < bs.length; j++) {
      if ((bs[j].innerText || "").trim() === want[i]) {
        out[want[i]] = { present: true, disabled: !!bs[j].disabled, title: bs[j].getAttribute("title") };
        break;
      }
    }
  }
  return out;
})()`;

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
  trace.push({ step: "pre-state", userTurns: pre.userTurns, replies: pre.replies?.length, canDiscuss: pre.canDiscuss });

  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));
  const netLog: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    if (r.url().includes("/discuss")) netLog.push({ at: Date.now(), method: r.request().method(), status: r.status(), serverTiming: r.headers()["server-timing"] ?? null, contentType: r.headers()["content-type"] ?? null });
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
  await page.waitForTimeout(3000);
  await card.scrollIntoViewIfNeeded();

  const controlsBefore = await page.evaluate(CONTROL_STATE);
  await page.screenshot({ path: `${outDir}/47c0-before-turn-enabled.png`, fullPage: false });

  const box = card.locator("textarea").first();
  await box.waitFor({ timeout: 30000 });
  await box.fill(MESSAGE);
  await page.waitForTimeout(400);
  await page.evaluate(RESET_SAMPLES);

  const tSend = Date.now();
  await box.press("Enter");

  let controlsInTurn: Record<string, unknown> | null = null;
  let inTurnShot = false;
  let firstProseMs: number | null = null;
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const st = (await page.evaluate(LIVE_STATE)) as { live: boolean; waiting: boolean; counter: string | null; proseLen: number };
    const elapsedMs = Date.now() - tSend;
    if (st.live && st.waiting && !inTurnShot && elapsedMs >= 6000) {
      controlsInTurn = { atMs: elapsedMs, counter: st.counter, buttons: await page.evaluate(CONTROL_STATE) };
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: `${outDir}/47c1-inturn-settle-disabled.png`, fullPage: false });
      await page.screenshot({ path: `${outDir}/47c1-inturn-settle-disabled-full.png`, fullPage: true });
      inTurnShot = true;
    }
    if (st.proseLen > 0 && firstProseMs === null) firstProseMs = elapsedMs;
    if (!st.live && firstProseMs !== null) break;
    if (!st.live && elapsedMs > 20000 && firstProseMs === null) { trace.push({ step: "turn-vanished-without-prose", elapsedMs }); break; }
    await page.waitForTimeout(40);
  }

  // Right after settle: the same four controls must be live again.
  await page.waitForTimeout(1200);
  const controlsAfter = await page.evaluate(CONTROL_STATE);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${outDir}/47c2-after-settle-enabled.png`, fullPage: false });

  // 47d — the whole 2-turn thread, revision anchored to its emitting turn.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/47d-two-turn-thread.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/47d-two-turn-thread-full.png`, fullPage: true });

  const dump = (await page.evaluate(DUMP_SAMPLES)) as {
    samples: Array<{ tMs: number; live: boolean; waiting: boolean; counter: string | null; settledCount: number; liveLen: number; useIt: { disabled: boolean | null }; keepAsIs: { disabled: boolean | null }; apply: { disabled: boolean | null }; dismiss: { disabled: boolean | null } }>;
    violations: unknown[];
    turns: Array<{ headers: { serverTiming?: string | null; contentType?: string | null } | null; frames: Array<{ tMs: number; raw: string }> }>;
  };
  const cardState = (await page.evaluate(CARD_STATE)) as {
    threadOrder: Array<{ kind: string; head?: string; len?: number }>;
    revisionCardPresent: boolean; danglingColon: string[]; cardText: string; capNotice: boolean;
  };
  const post = await (await api.get(discussUrl)).json();

  const rec = dump.turns[dump.turns.length - 1] ?? null;
  const ttftHeaderMs = parseTtftHeader(rec?.headers?.serverTiming ?? null);
  const waitingSamples = dump.samples.filter((s) => s.live && s.waiting && s.counter);
  const counterAtFirstProse = waitingSamples.length ? waitingSamples[waitingSamples.length - 1].counter : null;

  // Sampler corroboration of the D-183 flip.
  const inTurnSamples = dump.samples.filter((s) => s.live);
  const postTurnSamples = dump.samples.filter((s, i) => !s.live && i > 0);
  const allDisabledInTurn = inTurnSamples.length > 0 && inTurnSamples.every((s) =>
    s.useIt.disabled !== false && s.keepAsIs.disabled !== false && s.apply.disabled !== false && s.dismiss.disabled !== false);
  const anyDisabledAfter = postTurnSamples.some((s) =>
    s.useIt.disabled === true || s.keepAsIs.disabled === true || s.apply.disabled === true || s.dismiss.disabled === true);

  // D-185: document order — revision card must follow an assistant bubble and be
  // followed by the later turn's bubbles.
  const order = cardState.threadOrder.map((o) => o.kind);
  const cardIdx = order.indexOf("revision-card");
  const report = {
    shots: ["47c", "47d"],
    persona: "P1 (Maya)", book: BOOK, finding: FINDING,
    proves: "D-183 settle affordances disabled in-turn and live after settle; D-185 revision card anchored to its emitting turn with a later turn below",
    writerMessage: MESSAGE,
    network: netLog.filter((l) => (l.at as number) >= tSend),
    ttftHeaderMs,
    counterAtFirstProse,
    counterSecondsAtFirstProse: parseCounter(counterAtFirstProse),
    agreeWithin1s: ttftHeaderMs != null && parseCounter(counterAtFirstProse) != null
      ? Math.abs(ttftHeaderMs / 1000 - (parseCounter(counterAtFirstProse) as number)) <= 1.0 : null,
    firstProseInDomMs: firstProseMs,
    d183: {
      before: controlsBefore,
      inTurn: controlsInTurn,
      after: controlsAfter,
      samplerAllDisabledWhileLive: allDisabledInTurn,
      samplerAnyStillDisabledAfterSettle: anyDisabledAfter,
      hideStaysClickableInTurn: (controlsInTurn as { buttons?: Record<string, { present: boolean; disabled: boolean | null }> } | null)?.buttons?.Hide ?? null,
      cancelOfferedInTurn: (controlsInTurn as { buttons?: Record<string, { present: boolean; disabled: boolean | null }> } | null)?.buttons?.Cancel ?? null,
    },
    d185: {
      threadOrder: cardState.threadOrder,
      revisionCardPresent: cardState.revisionCardPresent,
      revisionCardIndex: cardIdx,
      precededByAssistant: cardIdx > 0 && order[cardIdx - 1] === "assistant",
      laterTurnBelow: cardIdx >= 0 && order.slice(cardIdx + 1).includes("assistant"),
      danglingColonCandidates: cardState.danglingColon,
    },
    threadState: { userTurnsBefore: pre.userTurns, userTurnsAfter: post.userTurns, repliesBefore: pre.replies?.length ?? 0, repliesAfter: post.replies?.length ?? 0, canDiscussAfter: post.canDiscuss },
    rawSyntaxViolations: dump.violations,
    cardTextTail: cardState.cardText.slice(-2000),
    domSamples: dump.samples,
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/47cd-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ttftHeaderMs, counterAtFirstProse, agreeWithin1s: report.agreeWithin1s,
    d183: { inTurn: (controlsInTurn as { buttons?: unknown } | null)?.buttons, after: controlsAfter, samplerAllDisabledWhileLive: allDisabledInTurn, samplerAnyStillDisabledAfterSettle: anyDisabledAfter },
    d185: { order, revisionCardIndex: cardIdx, precededByAssistant: report.d185.precededByAssistant, laterTurnBelow: report.d185.laterTurnBelow, dangling: cardState.danglingColon },
    thread: report.threadState, violations: report.rawSyntaxViolations.length,
  }, null, 2));
  await browser.close();
})();
