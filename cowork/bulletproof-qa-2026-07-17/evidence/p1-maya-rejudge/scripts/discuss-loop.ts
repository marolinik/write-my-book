/**
 * Drive a multi-turn DISCUSS conversation for P1 Maya on a real finding.
 * Reads E2E_TEST_SECRET from process.env — never printed. Acts as user_qa_p1.
 * Uses JSON.stringify for the body (no shell quoting).
 *
 * Usage: npx tsx --env-file=.env <thisfile> <findingId> <traceDir>
 *
 * Sends up to 3 authorial-intent turns (a coherent negotiation), then a 4th
 * turn to probe the MAX_USER_TURNS=3 cap. Writes each turn's full response to
 * <traceDir>/discuss-turnN.json and prints a preview (assistantMessage + suggestedConstraint).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.QA_BASE ?? "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p1";
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const findingId = process.argv[2];
const traceDir = process.argv[3] ?? ".";
if (!findingId) { console.error("usage: discuss-loop.ts <findingId> <traceDir>"); process.exit(1); }

const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK, "Content-Type": "application/json" };

// A coherent 3-turn authorial negotiation over the show-tell finding on the
// para-6 "clinical taxonomy" sentence. Maya defends the abstraction as
// deliberate characterization, tests whether the editor will negotiate, then
// states a final keep-as-intentional decision (should yield a suggestedConstraint).
const TURNS = [
  "I hear you, but that clinical line is deliberate. Imogen manages grief as \"arithmetic\" - she intellectualizes to keep feeling at a survivable distance. So the abstract self-classification IS her voice at that peak moment: the prose enacts her retreat into taxonomy exactly when the emotion is strongest. That's the point, not a lapse in register. Make the case: why should I break that characterization rather than trust the reader to feel the coldness as hers?",
  "That's fair. Suppose I keep the abstraction because it's her mind's move, but I'm willing to anchor it once so it doesn't read as the narrator's clinical language instead of hers. Can you give me a single grounding gesture - one physical beat right before the classification - that keeps the cold self-taxonomy intact but marks it clearly as Imogen doing the sorting, not me?",
  "Good. Here's my decision: I'm keeping the abstract self-classification as an intentional voice pattern - whenever Imogen hits an emotional peak, she retreats into arithmetic/taxonomy, and I want that dryness preserved rather than 'shown.' Please remember this as a standing preference for the manuscript so you don't keep flagging these interior-abstraction moments as show-tell lapses.",
];

async function turn(n: number, writerMessage: string) {
  const started = Date.now();
  let status = 0, bodyText = "", parsed: any = null, err: string | null = null;
  try {
    const resp = await fetch(`${BASE}/api/books/${BOOK}/editorial/findings/${findingId}/discuss`, {
      method: "POST", headers: H, body: JSON.stringify({ writerMessage }),
    });
    status = resp.status;
    bodyText = await resp.text();
    try { parsed = JSON.parse(bodyText); } catch {}
  } catch (e) { err = `${(e as Error).name}: ${(e as Error).message}`; }
  const elapsed_ms = Date.now() - started;
  const trace = {
    turn: n, request: { writerMessage },
    status, error: err, body: parsed ?? bodyText, elapsed_ms, capturedAt: new Date().toISOString(),
  };
  writeFileSync(join(traceDir, `discuss-turn${n}.json`), JSON.stringify(trace, null, 2));
  const am = parsed?.assistantMessage ?? parsed?.message ?? "(none)";
  const sc = parsed?.suggestedConstraint ?? parsed?.constraint ?? "(none)";
  const rev = parsed?.revisedSuggestion ?? "(none)";
  console.log(`--- TURN ${n} -> ${status} (${elapsed_ms}ms)${err ? " ERR:" + err : ""}`);
  console.log(`assistantMessage.len=${typeof am === "string" ? am.length : "n/a"} | preview: ${String(am).slice(0, 240).replace(/\n/g, " ")}`);
  console.log(`suggestedConstraint: ${String(sc).slice(0, 200).replace(/\n/g, " ")}`);
  console.log(`revisedSuggestion.len=${typeof rev === "string" && rev !== "(none)" ? rev.length : 0}`);
  return { status, parsed };
}

async function main() {
  for (let i = 0; i < TURNS.length; i++) {
    const r = await turn(i + 1, TURNS[i]);
    if (r.status === 502) { console.log("!! 502 empty-reply path hit (D-04 error path) — turn not consumed"); }
    if (r.status === 409) { console.log("!! capped early at turn " + (i + 1)); break; }
  }
  // 4th turn: probe the 3-turn cap (should 409, no LLM call).
  await turn(4, "One more thought - actually, keep everything as is, final answer.");
}
main();
