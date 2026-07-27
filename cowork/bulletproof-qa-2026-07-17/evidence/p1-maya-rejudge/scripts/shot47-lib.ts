/**
 * 47-series shared harness — the D-176 wait chrome, on camera.
 *
 * HARNESS NOTE (same class as the 43/46-series `__name` note): every in-page
 * snippet is a raw SOURCE STRING, never a function reference. tsx/esbuild runs
 * with `keepNames`, which rewrites arrows into `__name(() => …, "x")`; serialized
 * into the page that throws `__name is not defined` before a single assertion
 * runs, and a shim cannot fix it because the shim's own arrow gets wrapped too.
 */

export const BASE = process.env.QA_BASE ?? "http://localhost:3001";
export const HIDE = "nextjs-portal{display:none !important}";

/** Raw machine syntax that must never reach the writer's screen. */
const RAW_SYNTAX_SRC = "<{2,}|>{2,}|\\\\bREMEMBER\\\\b|\\\\bREVISION\\\\b";

/**
 * Installed before any app JS runs.
 *
 *  1. hides the Next dev-tools portal (protocol v8);
 *  2. tees every `POST …/discuss` so the SSE cadence and `Server-Timing` are
 *     OBSERVED (`res.clone()` — the app consumes the untouched body);
 *  3. samples the thread every **25 ms**: the live bubble, its waiting-line
 *     state, the elapsed counter as rendered, the count of settled assistant
 *     bubbles, and whether the settle controls are disabled. That single stream
 *     of samples is what proves D-176 (counter climbs), D-177 (no waiting frame
 *     between prose and settled) and D-183 (controls disabled in-turn) without
 *     asking the app to report on itself.
 */
export const INIT_SCRIPT = `
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
    var rec = { t0Wall: Date.now(), t0Perf: t0, frames: [], headers: null, endMs: null, readError: null, rejected: null };
    window.__d.turns.push(rec);
    return p.then(function (res) {
      rec.headers = {
        status: res.status,
        contentType: res.headers.get("content-type"),
        serverTiming: res.headers.get("server-timing"),
        tMs: performance.now() - t0
      };
      if (!res.body) return res;
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
    }).catch(function (e) {
      rec.rejected = { name: String(e && e.name), message: String(e && e.message), tMs: performance.now() - t0 };
      throw e;
    });
  };

  var btnState = function (label) {
    var bs = Array.prototype.slice.call(document.querySelectorAll("button"));
    for (var i = 0; i < bs.length; i++) {
      if ((bs[i].innerText || "").trim() === label) return { present: true, disabled: !!bs[i].disabled, title: bs[i].getAttribute("title") };
    }
    return { present: false, disabled: null, title: null };
  };

  setInterval(function () {
    var bubble = document.querySelector('[data-testid="discuss-live-bubble"]');
    var text = bubble ? bubble.innerText : null;
    var counterEl = document.querySelector('[data-testid="discuss-wait-elapsed"]');
    var hintEl = document.querySelector('[data-testid="discuss-wait-hint"]');
    var controls = document.querySelector('[data-testid="discuss-turn-controls"]');
    var noticeEl = document.querySelector('[data-testid="discuss-turn-notice"]');
    // Settled assistant bubbles share the live bubble's class by design (D5), so
    // the live one is excluded by its testid.
    var all = Array.prototype.slice.call(document.querySelectorAll('p[class*="bg-muted/40"][class*="mr-6"]'));
    var settledReplies = all.filter(function (el) { return el.getAttribute("data-testid") !== "discuss-live-bubble"; });
    var ta = document.querySelector('[id^="finding-card-"] textarea');
    var sample = {
      tMs: Math.round(performance.now()),
      wall: Date.now(),
      live: !!bubble,
      waiting: !!(text && /editor is (replying|still thinking)/i.test(text)),
      liveHead: text ? text.slice(0, 54) : null,
      liveLen: text ? text.length : 0,
      counter: counterEl ? (counterEl.innerText || "").trim() : null,
      hint: hintEl ? (hintEl.innerText || "").trim().slice(0, 90) : null,
      controls: !!controls,
      notice: noticeEl ? (noticeEl.innerText || "").trim() : null,
      settledCount: settledReplies.length,
      lastSettledLen: settledReplies.length ? (settledReplies[settledReplies.length - 1].innerText || "").length : 0,
      composer: ta ? { value: ta.value, disabled: !!ta.disabled } : null,
      useIt: btnState("Use it"),
      keepAsIs: btnState("Keep as-is"),
      apply: btnState("Apply"),
      dismiss: btnState("Dismiss")
    };
    var arr = window.__dom.samples;
    var prev = arr.length ? arr[arr.length - 1] : null;
    var key = function (s) {
      return [s.live, s.waiting, s.liveHead, s.liveLen, s.counter, s.controls, s.notice, s.settledCount,
        s.lastSettledLen, s.composer ? s.composer.value.length + ":" + s.composer.disabled : "-",
        s.useIt.disabled, s.keepAsIs.disabled, s.apply.disabled, s.dismiss.disabled].join("|");
    };
    if (!prev || key(prev) !== key(sample)) arr.push(sample);
    if (bubble && bubble.parentElement) {
      var thread = bubble.parentElement.innerText || "";
      var m = thread.match(RAW);
      if (m) window.__dom.violations.push({ tMs: Math.round(performance.now()), match: m[0], snippet: thread.slice(0, 400) });
    }
  }, 25);
})();
`;

export const RESET_SAMPLES = `(function(){ window.__dom.samples = []; window.__dom.violations = []; return true; })()`;

/** Live snapshot for the node-side polling loop (cheap: no arrays returned). */
export const LIVE_STATE = `(function(){
  var b = document.querySelector('[data-testid="discuss-live-bubble"]');
  var c = document.querySelector('[data-testid="discuss-wait-elapsed"]');
  var h = document.querySelector('[data-testid="discuss-wait-hint"]');
  var n = document.querySelector('[data-testid="discuss-turn-notice"]');
  var t = b ? b.innerText : null;
  return {
    live: !!b,
    text: t,
    waiting: !!(t && /editor is (replying|still thinking)/i.test(t)),
    counter: c ? (c.innerText || "").trim() : null,
    hint: h ? (h.innerText || "").trim() : null,
    notice: n ? (n.innerText || "").trim() : null,
    proseLen: t && !/editor is (replying|still thinking)/i.test(t) ? t.replace(/\\u258D/g, "").trim().length : 0
  };
})()`;

export const DUMP_SAMPLES = `(function(){
  return {
    samples: window.__dom.samples,
    violations: window.__dom.violations,
    turns: window.__d.turns.map(function (r) {
      return { headers: r.headers, endMs: r.endMs, readError: r.readError, rejected: r.rejected,
        frames: r.frames.map(function (f) { return { tMs: Math.round(f.tMs), raw: f.raw }; }) };
    })
  };
})()`;

/** Card text + the settle-control state, read once after a turn settles. */
export const CARD_STATE = `(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('[id^="finding-card-"]'));
  var target = cards.length === 1 ? cards[0] : null;
  for (var i = 0; i < cards.length && !target; i++) {
    if (cards[i].querySelector('textarea') || /3-exchange cap reached/.test(cards[i].innerText || "")) target = cards[i];
  }
  var txt = target ? target.innerText : "";
  var revision = target ? target.querySelector('[data-testid="discuss-revision-card"]') : null;
  // D-185: document order — the revision card must sit inside the block of the
  // turn that emitted it, with any later turn BELOW it.
  var order = [];
  if (target) {
    var walk = target.querySelectorAll('p[class*="bg-muted/40"][class*="mr-6"], p[class*="bg-primary/10"][class*="ml-6"], [data-testid="discuss-revision-card"]');
    for (var j = 0; j < walk.length; j++) {
      var el = walk[j];
      if (el.getAttribute("data-testid") === "discuss-revision-card") order.push({ kind: "revision-card" });
      else order.push({ kind: (el.className.indexOf("bg-primary/10") >= 0 ? "writer" : "assistant"), head: (el.innerText || "").slice(0, 60), len: (el.innerText || "").length });
    }
  }
  var chip = txt.match(/I['\\u2019]ll remember:[^\\n]*/);
  return {
    cardText: txt,
    threadOrder: order,
    revisionCardPresent: !!revision,
    chip: chip ? chip[0] : null,
    capNotice: /3-exchange cap reached/.test(txt),
    danglingColon: /:\\s*\\n/.test(txt) ? (txt.match(/[^\\n]*:\\s*\\n/g) || []).slice(-4) : []
  };
})()`;

export function parseTtftHeader(serverTiming: string | null | undefined): number | null {
  if (!serverTiming) return null;
  const m = /ttft;dur=(\d+(?:\.\d+)?)/.exec(serverTiming);
  return m ? Math.round(Number(m[1])) : null;
}

/** "24s" | "1m 05s" -> seconds */
export function parseCounter(counter: string | null | undefined): number | null {
  if (!counter) return null;
  const min = /(\d+)m\s*(\d+)s/.exec(counter);
  if (min) return Number(min[1]) * 60 + Number(min[2]);
  const sec = /(\d+)s/.exec(counter);
  return sec ? Number(sec[1]) : null;
}
