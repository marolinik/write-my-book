/**
 * 46-series — the D5 closure: finding-discuss turns STREAM, on camera.
 *
 * Drives real writer turns through the real Editorial Review UI as P1 (Maya) and
 * measures the stream three independent ways, so nothing is taken on the client's
 * word:
 *
 *   1. Playwright `response` events   -> status, content-type, Server-Timing
 *   2. an in-page `fetch` tee         -> per-SSE-frame arrival timestamps
 *      (`res.clone()`, so the app consumes the untouched body)
 *   3. a 25 ms in-page DOM sampler    -> what the writer's bubble actually showed,
 *      frame by frame, plus a raw-control-syntax tripwire that fires the moment
 *      `<<`, `>>`, REMEMBER or REVISION reaches the thread mid-stream
 *
 * Per turn it writes `46-turn<N>.json` plus a pre-first-token, a mid-stream and a
 * settled screenshot.
 *
 * HARNESS NOTE (why every in-page snippet below is a STRING, not a function):
 * tsx/esbuild runs with `keepNames`, which rewrites `{ value: (x) => x }` into
 * `{ value: __name((x) => x, "value") }`. Serialized into the page that throws
 * `__name is not defined` before a single assertion runs — and a `__name` shim
 * cannot fix it, because the shim's own arrow gets wrapped too. Raw source
 * strings bypass the transform entirely. (Same class of harness bug as the
 * 43-series `__name` note; this is the durable fix.)
 *
 * Usage: npx tsx --env-file=.env shot46.ts <outDir> <findingId> <turnsToSend>
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
const CLERK = "user_qa_p1";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, FINDING, turnsArg] = process.argv.slice(2);
if (!outDir || !FINDING) { console.error("usage: <outDir> <findingId> [turnsToSend]"); process.exit(1); }
const TURNS_TO_SEND = Number(turnsArg ?? "1");

const HIDE = "nextjs-portal{display:none !important}";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

/** Writer messages, chosen to exercise both control blocks the gate must hide. */
const MESSAGES = [
  // Turn 1 — invite a revision (should produce <<<REVISION>>>): the 46a/46c leg.
  "I'm not attached to that line. Show me your tighter version of it so I can compare.",
  // Turn 2 — defend an intentional choice (should produce <<<REMEMBER>>>): the 46b leg.
  "Actually the flatness is deliberate: Imogen retreats into taxonomy whenever feeling gets close, so abstraction AT the emotional peak is the characterisation, not a lapse. Please stop flagging it.",
  // Turn 3 — closes the thread and takes it to the 3-exchange cap: the 46d leg.
  "Understood. Last thing: in one sentence, what would you watch for if I keep it as written?",
];

/** Raw machine syntax that must never reach the writer's screen. */
const RAW_SYNTAX_SRC = "<{2,}|>{2,}|\\\\bREMEMBER\\\\b|\\\\bREVISION\\\\b";

const INIT_SCRIPT = `
(function () {
  var style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none !important}";
  document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });

  window.__d = { turns: [] };
  window.__dom = { samples: [], violations: [] };
  var RAW = new RegExp("${RAW_SYNTAX_SRC}");

  var origFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var input = args[0];
    var init = args[1];
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var isDiscussPost = url.indexOf("/discuss") >= 0 && method === "POST";
    var p = origFetch.apply(this, args);
    if (!isDiscussPost) return p;
    var t0 = performance.now();
    var rec = { t0Wall: Date.now(), frames: [], headers: null, endMs: null, readError: null };
    window.__d.turns.push(rec);
    return p.then(function (res) {
      rec.headers = {
        status: res.status,
        contentType: res.headers.get("content-type"),
        serverTiming: res.headers.get("server-timing"),
        tMs: performance.now() - t0
      };
      if (!res.body) return res;
      // Tee: the app gets \`res\` untouched; the clone is read here only to
      // timestamp arrivals, so cadence is OBSERVED, not reported by the app.
      var clone = res.clone();
      var reader = clone.body.getReader();
      var dec = new TextDecoder();
      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) { rec.endMs = performance.now() - t0; return; }
          rec.frames.push({ tMs: performance.now() - t0, raw: dec.decode(r.value, { stream: true }) });
          return pump();
        });
      };
      pump().catch(function (e) { rec.readError = String(e && e.message); });
      return res;
    });
  };

  // 25 ms sampler on the live bubble + raw-control-syntax tripwire on the thread.
  setInterval(function () {
    var bubble = document.querySelector('[data-testid="discuss-live-bubble"]');
    var text = bubble ? bubble.innerText : null;
    var arr = window.__dom.samples;
    var prev = arr.length ? arr[arr.length - 1].text : undefined;
    if (text !== prev) arr.push({ tMs: performance.now(), wall: Date.now(), text: text, len: text ? text.length : 0, live: !!bubble });
    if (bubble && bubble.parentElement) {
      var thread = bubble.parentElement.innerText || "";
      var m = thread.match(RAW);
      if (m) window.__dom.violations.push({ tMs: performance.now(), wall: Date.now(), match: m[0], snippet: thread.slice(0, 600) });
    }
  }, 25);
})();
`;

const RESET_SAMPLES = `(function(){ window.__dom.samples = []; window.__dom.violations = []; return true; })()`;

const LIVE_BUBBLE_STATE = `(function(){
  var b = document.querySelector('[data-testid="discuss-live-bubble"]');
  return { present: !!b, text: b ? b.innerText : null };
})()`;

const SETTLED_STATE = `(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('[id^="finding-card-"]'));
  var target = null;
  for (var i = 0; i < cards.length; i++) {
    var t = cards[i].innerText || "";
    if (cards[i].querySelector("textarea") || /3-exchange cap reached/.test(t)) { target = cards[i]; break; }
  }
  var txt = target ? target.innerText : "";
  var chip = txt.match(/I['\\u2019]ll remember:[^\\n]*/);
  return {
    cardText: txt,
    chip: chip ? chip[0] : null,
    capNotice: /3-exchange cap reached/.test(txt),
    revisionCard: /Use it/.test(txt),
    samples: window.__dom.samples,
    violations: window.__dom.violations,
    streamRec: window.__d.turns.length ? window.__d.turns[window.__d.turns.length - 1] : null
  };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: H,
  });
  await ctx.addInitScript({ content: INIT_SCRIPT });

  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];

  // ENV-01: warm the discuss GET + the editorial page server-side, off camera.
  for (const [k, u] of [
    ["discuss-get", `${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`],
    ["editorial-page", `${BASE}/books/${BOOK}/editorial`],
  ] as const) {
    const t = Date.now();
    const r = await api.get(u);
    trace.push({ step: `warm-${k}`, status: r.status(), ms: Date.now() - t });
  }
  const preThread = await (await api.get(`${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`)).json();
  trace.push({ step: "pre-state", userTurns: preThread.userTurns, canDiscuss: preThread.canDiscuss, replies: preThread.replies?.length });

  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => trace.push({ step: "pageerror", message: e.message }));
  const netLog: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/discuss")) {
      netLog.push({
        at: Date.now(), url: u.replace(BASE, ""), method: r.request().method(), status: r.status(),
        contentType: r.headers()["content-type"] ?? null, serverTiming: r.headers()["server-timing"] ?? null,
      });
    }
  });

  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const card = page.locator(`#finding-card-${FINDING}`);
  await card.waitFor({ state: "visible", timeout: 180000 });
  await page.waitForTimeout(3000);
  await card.scrollIntoViewIfNeeded();

  const installed = await page.evaluate(`(function(){ return { d: typeof window.__d, dom: typeof window.__dom, fetchPatched: /isDiscussPost/.test(String(window.fetch)) }; })()`);
  trace.push({ step: "instrumentation", ...(installed as Record<string, unknown>) });

  // Open the thread (the Discuss toggle inside the card).
  const discussBtn = card.getByRole("button", { name: /Discuss|Hide/ }).first();
  await discussBtn.waitFor({ timeout: 60000 });
  if (/Discuss/.test((await discussBtn.innerText()).trim())) await discussBtn.click();
  await page.waitForTimeout(2500);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/46-thread-open.png`, fullPage: false });

  const results: Array<Record<string, unknown>> = [];

  for (let n = 0; n < TURNS_TO_SEND; n++) {
    const turnIndex = (preThread.userTurns ?? 0) + n; // 0-based turn number overall
    const msg = MESSAGES[Math.min(turnIndex, MESSAGES.length - 1)];
    const box = card.locator("textarea");
    if ((await box.count()) === 0) { trace.push({ step: "no-input-cap-reached", turnIndex }); break; }

    await box.first().fill(msg);
    await page.waitForTimeout(400);
    await page.evaluate(RESET_SAMPLES);

    // Enter is the product's own send affordance (ConversationInput.handleKeyDown).
    const tSend = Date.now();
    await box.first().press("Enter");

    let shotWaiting = false;
    let firstTextDomMs: number | null = null;
    let shotMid = false;
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      const st = (await page.evaluate(LIVE_BUBBLE_STATE)) as { present: boolean; text: string | null };
      if (st.present && !shotWaiting && st.text && /editor is replying/i.test(st.text)) {
        await page.screenshot({ path: `${outDir}/46-turn${turnIndex + 1}-a-prefirsttoken.png`, fullPage: false });
        shotWaiting = true;
      }
      if (st.present && st.text && !/editor is replying/i.test(st.text) && st.text.trim().length > 0) {
        if (firstTextDomMs === null) firstTextDomMs = Date.now() - tSend;
        if (!shotMid && st.text.replace(/▍/g, "").trim().length > 80) {
          await page.screenshot({ path: `${outDir}/46-turn${turnIndex + 1}-b-midstream.png`, fullPage: false });
          shotMid = true;
        }
      }
      if (!st.present && firstTextDomMs !== null) break;                        // settled
      if (!st.present && shotWaiting && Date.now() - tSend > 15000) break;      // failed/fell back
      await page.waitForTimeout(50);
    }
    const tSettleDom = Date.now() - tSend;

    // Settled view: revision card / constraint chip / cap notice.
    await page.waitForTimeout(2500);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${outDir}/46-turn${turnIndex + 1}-c-settled.png`, fullPage: false });
    await page.screenshot({ path: `${outDir}/46-turn${turnIndex + 1}-c-settled-full.png`, fullPage: true });

    const dom = (await page.evaluate(SETTLED_STATE)) as {
      cardText: string; chip: string | null; capNotice: boolean; revisionCard: boolean;
      samples: Array<{ tMs: number; len: number; text: string | null }>;
      violations: Array<Record<string, unknown>>;
      streamRec: { headers?: Record<string, unknown>; frames?: Array<{ tMs: number; raw: string }>; endMs?: number; readError?: string | null } | null;
    };

    // --- frame-level cadence from the tee ---
    const rec = dom.streamRec ?? {};
    const events: Array<{ tMs: number; type: string; text?: string }> = [];
    const rawBody = (rec.frames ?? []).map((f) => f.raw).join("");
    for (const f of rec.frames ?? []) {
      for (const line of f.raw.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        try {
          const j = JSON.parse(t.slice(5).trim()) as { type: string; text?: string };
          events.push({ tMs: f.tMs, type: j.type, text: j.type === "text" ? j.text : undefined });
        } catch { /* frame split across chunks — the raw body is kept below */ }
      }
    }
    const textEvents = events.filter((e) => e.type === "text");
    const gaps = textEvents.slice(1).map((e, i) => Math.round(e.tMs - textEvents[i].tMs));
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const doneEvent = events.filter((e) => e.type === "done")[0] ?? null;
    const lastText = textEvents.length ? textEvents[textEvents.length - 1] : null;
    const headers = (rec.headers ?? null) as Record<string, unknown> | null;

    const turnReport = {
      turnNumber: turnIndex + 1,
      writerMessage: msg,
      network: netLog.filter((l) => (l.at as number) >= tSend),
      streamHeaders: headers,
      streamedIsSse: /text\/event-stream/.test(String(headers?.contentType ?? "")),
      ttftMs: textEvents.length ? Math.round(textEvents[0].tMs) : null,
      responseHeadersAtMs: headers?.tMs != null ? Math.round(headers.tMs as number) : null,
      firstTextInDomMs: firstTextDomMs,
      textFrameCount: textEvents.length,
      interFrameGapsMs: gaps,
      medianGapMs: median,
      streamSpanMs: textEvents.length > 1 ? Math.round(textEvents[textEvents.length - 1].tMs - textEvents[0].tMs) : 0,
      settleTailMs: doneEvent && lastText ? Math.round(doneEvent.tMs - lastText.tMs) : null,
      doneAtMs: doneEvent ? Math.round(doneEvent.tMs) : null,
      bodyEndMs: rec.endMs != null ? Math.round(rec.endMs) : null,
      teeReadError: rec.readError ?? null,
      domSettledMs: tSettleDom,
      frameTypes: events.map((e) => e.type),
      streamedText: textEvents.map((e) => e.text ?? "").join(""),
      rawSseBody: rawBody,
      domSampleCount: dom.samples.length,
      domGrowth: dom.samples.map((s) => ({ tMs: Math.round(s.tMs), len: s.len, head: (s.text ?? "").slice(0, 46) })),
      rawSyntaxViolations: dom.violations,
      settled: { chip: dom.chip, capNotice: dom.capNotice, revisionCard: dom.revisionCard },
      cardTextTail: dom.cardText.slice(-1600),
      shots: { preFirstToken: shotWaiting, midStream: shotMid },
    };
    results.push(turnReport);
    writeFileSync(`${outDir}/46-turn${turnIndex + 1}.json`, JSON.stringify(turnReport, null, 2));
    console.log(`--- turn ${turnIndex + 1} ---`);
    console.log(JSON.stringify({
      sse: turnReport.streamedIsSse, headers: turnReport.streamHeaders, ttftMs: turnReport.ttftMs,
      firstTextInDomMs: turnReport.firstTextInDomMs, frames: turnReport.textFrameCount,
      gaps: turnReport.interFrameGapsMs, medianGapMs: turnReport.medianGapMs,
      settleTailMs: turnReport.settleTailMs, doneAtMs: turnReport.doneAtMs, bodyEndMs: turnReport.bodyEndMs,
      domSamples: turnReport.domSampleCount, violations: turnReport.rawSyntaxViolations.length,
      settled: turnReport.settled, shots: turnReport.shots,
    }, null, 2));

    await page.waitForTimeout(2000);
  }

  // Post-state + the cap probe (server-side 409 BEFORE any stream: free, no LLM).
  const postThread = await (await api.get(`${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`)).json();
  let capProbe: Record<string, unknown> | null = null;
  if ((postThread.userTurns ?? 0) >= 3) {
    const t = Date.now();
    const r = await api.post(`${BASE}/api/books/${BOOK}/editorial/findings/${FINDING}/discuss`, {
      headers: { ...H, "Content-Type": "application/json" },
      data: { writerMessage: "One more thing." },
    });
    capProbe = { status: r.status(), ms: Date.now() - t, contentType: r.headers()["content-type"] ?? null, body: await r.json() };
  }

  const summary = {
    series: "46",
    persona: "P1 (Maya)", book: BOOK, finding: FINDING,
    proves: "D5 — finding-discuss turns stream (ttft, cadence, no control-syntax leak, cap, billing)",
    trace,
    turns: results,
    threadAfter: { userTurns: postThread.userTurns, canDiscuss: postThread.canDiscuss, replies: postThread.replies?.length },
    capProbe,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/46-summary-turn${(preThread.userTurns ?? 0) + 1}.json`, JSON.stringify(summary, null, 2));
  console.log("--- cap probe ---\n" + JSON.stringify(capProbe, null, 2));
  await browser.close();
})();
