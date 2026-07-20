// Phase 1b: LIVE line-edit pass on ch5 (planted-probe) with the persona's BYOK
// qwen key (default model openrouter-qwen36/sonnet). Captures the raw SSE transcript,
// the completion metadata, and the resulting findings. Byte-verifies every new
// finding's anchor against ch5 content (D8 misquote cap) and classifies each against
// the pre-registered device registry (V1-V6 survive? E1-E6 recall?).
import { readFileSync } from "node:fs";
import { api, streamSSE, saveTrace, saveTranscript, BOOK_ID, CHAPTERS } from "./_client";

const PLANTED_PATH =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p6-owen/manuscripts/owen-ch5-what-the-water-keeps.md";

function nfc(s: string): string {
  return s.normalize("NFC");
}

// Device instances (V1-V6) and planted errors (E1-E6) verbatim fragments from
// device-registry.md — used to classify findings.
const DEVICES: Record<string, string> = {
  V1_andstack: "the rope and the ring and the salt that held them together",
  V2_paradox: "Two things true at once: the skiff was Kova's",
  V3_log: "SW 4 knots. Vis good. One skiff, north shingle, no oars.",
  V4_inference: "The knots at the bow were tied wet",
  V5_fragment: "No oars. None.",
  V6_wit: "A boat with no oars arrives the way a bill arrives",
};
const PLANTS: Record<string, string> = {
  E1_double_under: "wedged under the stone I had found the first letter under",
  E2_small_echo: "a small boat with a small cabin",
  E3_filter_word: "I saw that the rope had frayed",
  E4_palpable: "a palpable silence",
  E5_purple: "the sunset bled crimson and gold across the heavens",
  E6_dangler: "Walking back up the steps, the lamp seemed dimmer than it should",
};

async function main() {
  const runStart = new Date().toISOString();
  const out: Record<string, unknown> = { runStart };
  const content = nfc(((await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`)).body as { markdown?: string }).markdown ?? "");
  out["content-before"] = { len: content.length, matchesPlanted: content === nfc(readFileSync(PLANTED_PATH, "utf8")) };

  // Start the line-edit session
  const start = await api("POST", `/api/books/${BOOK_ID}/agent`, {
    workflowId: "line-edit",
    chapterNumber: 5,
  });
  out["start"] = start;
  const sessionId = (start.body as { sessionId?: string }).sessionId;
  if (!sessionId) {
    saveTrace("p1b-lineedit-ch5.json", out);
    console.log("NO SESSION — start body:", JSON.stringify(start.body));
    return;
  }
  console.log("session", sessionId, "queued:", (start.body as { queued?: boolean }).queued);

  // Stream events
  const rawEvents: Array<{ t: number; raw: string }> = [];
  let lastType = "";
  const stream = await streamSSE(
    `/api/books/${BOOK_ID}/agent/${sessionId}/stream`,
    (ev, raw) => {
      rawEvents.push({ t: Date.now() / 1000, raw: raw.slice(0, 4000) });
      if (ev.type !== lastType) {
        console.log("  ev:", ev.type);
        lastType = ev.type as string;
      }
    },
    600000
  );
  out["stream"] = {
    nEvents: stream.nEvents,
    elapsed: stream.elapsed,
    final: stream.final,
  };
  saveTranscript("line-edit-ch5-rejudge-sse-raw.json", {
    sessionId,
    nEvents: stream.nEvents,
    elapsed: stream.elapsed,
    final: stream.final,
    events: stream.events.map((e) => ({ t: e.t, ev: e.ev })),
  });

  // Fetch findings for ch5 created after runStart
  const findAll = await api("GET", `/api/books/${BOOK_ID}/editorial/findings?chapterNumber=5&limit=100`);
  const all = (findAll.body as { findings?: Array<Record<string, unknown>> }).findings ?? [];
  const newFindings = all.filter((f) => (f.createdAt as string) >= runStart);
  out["findings-new-count"] = newFindings.length;

  // Byte-verify + classify each new finding
  const analysis = newFindings.map((f) => {
    const orig = (f.originalText as string) ?? "";
    const anchor = (f.anchorQuote as string) ?? "";
    const nt = (f.newText as string) ?? null;
    const origVerbatim = orig ? content.includes(nfc(orig)) : null;
    const anchorVerbatim = anchor ? content.includes(nfc(anchor)) : null;
    // Which plant / device does it touch?
    const touchedPlants = Object.entries(PLANTS)
      .filter(([, frag]) => (orig && orig.includes(frag)) || (anchor && anchor.includes(frag)) || ((f.description as string) ?? "").includes(frag))
      .map(([k]) => k);
    const touchedDevices = Object.entries(DEVICES)
      .filter(([, frag]) => (orig && orig.includes(frag)) || (anchor && anchor.includes(frag)))
      .map(([k]) => k);
    return {
      id: (f.id as string).slice(0, 8),
      severity: f.severity,
      category: f.category,
      status: f.status,
      originalText: orig,
      anchorQuote: anchor,
      newText: nt,
      description: ((f.description as string) ?? "").slice(0, 400),
      origVerbatim,
      anchorVerbatim,
      touchedPlants,
      touchedDevices,
    };
  });
  out["findings-analysis"] = analysis;

  // Summary metrics
  const misquotes = analysis.filter((a) => a.origVerbatim === false || a.anchorVerbatim === false);
  const plantsCaught = new Set<string>();
  const devicesFlagged = new Set<string>();
  for (const a of analysis) {
    a.touchedPlants.forEach((p) => plantsCaught.add(p));
    a.touchedDevices.forEach((d) => devicesFlagged.add(d));
  }
  out["metrics"] = {
    newFindings: analysis.length,
    misquotes: misquotes.length,
    misquoteDetail: misquotes.map((m) => m.id),
    plantsCaught: [...plantsCaught],
    plantRecall: `${plantsCaught.size}/6`,
    devicesFlagged: [...devicesFlagged],
    devicePrecision: `${6 - devicesFlagged.size}/6 survive`,
  };

  saveTrace("p1b-lineedit-ch5.json", out);
  console.log("\n=== METRICS ===");
  console.log(JSON.stringify(out["metrics"], null, 1));
  console.log("\n=== FINDINGS ===");
  for (const a of analysis) {
    console.log(`[${a.severity}/${a.category}] ${a.id} origVerbatim=${a.origVerbatim} anchorVerbatim=${a.anchorVerbatim} plants=${a.touchedPlants} devices=${a.touchedDevices}`);
    console.log(`   orig: ${JSON.stringify(a.originalText.slice(0, 120))}`);
    console.log(`   new : ${JSON.stringify((a.newText ?? "").slice(0, 120))}`);
  }
}
main().catch((e) => {
  console.error("ERR", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
