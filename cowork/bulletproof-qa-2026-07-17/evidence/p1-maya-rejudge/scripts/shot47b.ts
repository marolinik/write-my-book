/**
 * Shot 47b — the cancelled turn. THE proof the D-176 Cancel affordance is honest.
 *
 * Sends a real writer turn, waits until the wait chrome is up and the counter has
 * climbed past the 8 s phase flip, clicks **Cancel**, and then asks four
 * independent questions:
 *
 *   1. does the thread say what happened (muted notice, not silence — D-129)?
 *   2. is the writer's sentence back in the composer (D-178 restore-on-reject)?
 *   3. is `userTurns` unchanged on the server's own GET?
 *   4. is the turn still available (composer live, canDiscuss true)?
 *
 * `finding_replies` row count is asserted in psql by the caller, before and after.
 *
 * Usage: npx tsx --env-file=.env shot47b.ts <outDir> <bookId> <findingId> [cancelAtSeconds]
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import {
  BASE, HIDE, INIT_SCRIPT, RESET_SAMPLES, LIVE_STATE, DUMP_SAMPLES, CARD_STATE,
  parseCounter, parseTtftHeader,
} from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, FINDING, cancelAtArg] = process.argv.slice(2);
if (!outDir || !BOOK || !FINDING) { console.error("usage: <outDir> <bookId> <findingId> [cancelAtSeconds]"); process.exit(1); }
const CANCEL_AT_S = Number(cancelAtArg ?? "9");
const CLERK = "user_qa_p1";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

const MESSAGE =
  "Before I answer properly — hold on, I want to check the chapter first. (This turn is going to be cancelled.)";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT_SCRIPT });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];
  const discussUrl = `${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`;

  // ENV-01: warm both routes off camera so no timing below is a compile artifact.
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
  page.on("requestfailed", (r) => {
    if (r.url().includes("/discuss")) netLog.push({ at: Date.now(), method: r.method(), failed: r.failure()?.errorText ?? null });
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

  // Wait for the chrome, shoot it, then cancel past the 8 s phase flip.
  let shotEarly = false;
  let counterAtCancel: string | null = null;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const st = (await page.evaluate(LIVE_STATE)) as { live: boolean; counter: string | null; waiting: boolean; proseLen: number };
    const elapsed = (Date.now() - tSend) / 1000;
    if (st.live && st.waiting && !shotEarly && elapsed >= 2) {
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: `${outDir}/47b1-wait-chrome-before-cancel.png`, fullPage: false });
      shotEarly = true;
    }
    if (st.live && st.waiting && elapsed >= CANCEL_AT_S) { counterAtCancel = st.counter; break; }
    if (st.proseLen > 0) { trace.push({ step: "prose-arrived-before-cancel-window", elapsed }); counterAtCancel = st.counter; break; }
    await page.waitForTimeout(50);
  }

  await page.screenshot({ path: `${outDir}/47b2-at-cancel-click.png`, fullPage: false });
  const cancelBtn = page.locator('[data-testid="discuss-turn-controls"]').getByRole("button", { name: "Cancel" }).first();
  const cancelVisible = (await cancelBtn.count()) > 0;
  const tCancel = Date.now();
  if (cancelVisible) await cancelBtn.click();
  trace.push({ step: "cancel-clicked", visible: cancelVisible, atMsAfterSend: tCancel - tSend, counterAtCancel });

  // Settle: the notice and the restored composer.
  await page.waitForTimeout(2500);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${outDir}/47b3-cancelled-notice.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/47b3-cancelled-notice-full.png`, fullPage: true });

  const after = (await page.evaluate(LIVE_STATE)) as { live: boolean; notice: string | null };
  const cardState = (await page.evaluate(CARD_STATE)) as Record<string, unknown>;
  const dump = (await page.evaluate(DUMP_SAMPLES)) as {
    samples: Array<Record<string, unknown>>; violations: unknown[];
    turns: Array<{ headers: { status?: number; serverTiming?: string | null } | null; rejected: Record<string, unknown> | null; frames: Array<{ tMs: number; raw: string }> }>;
  };
  const composerValue = (await box.inputValue().catch(() => null)) as string | null;
  const composerDisabled = await box.isDisabled().catch(() => null);

  const post = await (await api.get(discussUrl)).json();

  // Still usable? (A cancel that poisons the thread would be worse than no cancel.)
  const stillSendable = (await card.locator("textarea").count()) > 0 && post.canDiscuss === true;
  await page.screenshot({ path: `${outDir}/47b4-turn-still-available.png`, fullPage: false });

  const rec = dump.turns[dump.turns.length - 1] ?? null;
  const report = {
    shot: "47b",
    persona: "P1 (Maya)", book: BOOK, finding: FINDING,
    proves: "D-176 Cancel is real: muted notice, composer restored, userTurns unchanged, no reply persisted, turn still available",
    cancelAtSecondsRequested: CANCEL_AT_S,
    cancelClickedAtMs: tCancel - tSend,
    counterAtCancel,
    counterAtCancelSeconds: parseCounter(counterAtCancel),
    writerMessage: MESSAGE,
    fetchRejection: rec?.rejected ?? null,
    fetchHeaders: rec?.headers ?? null,
    ttftHeaderMs: parseTtftHeader(rec?.headers?.serverTiming ?? null),
    sseFramesBeforeCancel: rec?.frames?.length ?? 0,
    network: netLog.filter((l) => (l.at as number) >= tSend),
    noticeAfterCancel: after.notice,
    liveBubbleAfterCancel: after.live,
    composerAfterCancel: { value: composerValue, disabled: composerDisabled },
    threadState: { userTurnsBefore: pre.userTurns, userTurnsAfter: post.userTurns, repliesBefore: pre.replies?.length ?? 0, repliesAfter: post.replies?.length ?? 0, canDiscussAfter: post.canDiscuss },
    cardState,
    domSamples: dump.samples,
    rawSyntaxViolations: dump.violations,
    verdict: {
      cancelButtonWasVisible: cancelVisible,
      noticeShown: !!after.notice,
      noticeIsMuted: /cancelled/i.test(after.notice ?? ""),
      composerRestored: (composerValue ?? "").trim() === MESSAGE.trim(),
      liveBubbleGone: after.live === false,
      userTurnsUnchanged: pre.userTurns === post.userTurns,
      repliesUnchanged: (pre.replies?.length ?? 0) === (post.replies?.length ?? 0),
      turnStillAvailable: stillSendable,
    },
    trace,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/47b-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, counterAtCancel, cancelClickedAtMs: report.cancelClickedAtMs, notice: after.notice, thread: report.threadState, composer: composerValue?.slice(0, 60) }, null, 2));
  await browser.close();
})();
