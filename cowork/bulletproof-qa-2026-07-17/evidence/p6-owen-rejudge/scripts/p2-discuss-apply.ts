// Phase 2: discuss (hold-ground + adapt), D-41b (revisedSuggestion persisted),
// D-42 (session-status endpoint), D-39 finding-route ZodError leak, D-41a
// destructive-apply guard, real apply round-trip (byte-safe, exact-span).
import { api, saveTrace, saveTranscript, BOOK_ID, CHAPTERS } from "./_client";

const CRIT = "b48e321f-e7b7-49aa-a160-c0b69e2b396b"; // critical sunset (E5)
const DANGLER = "42e70291-7151-40e1-8918-9ae30d85173d"; // suggestion dangler (E6)
const PALPABLE = "acaf7362-6194-43c0-9a89-e379edd91f5b"; // important palpable (E4)

function nfc(s: string): string { return s.normalize("NFC"); }

async function main() {
  const out: Record<string, unknown> = {};

  // --- D-42: session-status endpoint for a recent session ---
  // Use the line-edit session id from p1b run.
  const recentSession = "15c82e80-5296-49cf-a498-e77a651ce9b2";
  out["D42-session-status-get"] = await api("GET", `/api/books/${BOOK_ID}/agent/${recentSession}`);

  // --- D-39 finding-route: bad action enum on a REAL finding → clean 400? ---
  out["D39-finding-bad-action-real"] = await api(
    "PATCH",
    `/api/books/${BOOK_ID}/editorial/findings/${PALPABLE}`,
    { action: "not-a-real-action", dismissReason: "x" }
  );

  // --- Discuss hold-ground on the critical sunset finding (weak aesthetic defense) ---
  const critBefore = await api("GET", `/api/books/${BOOK_ID}/editorial/findings?chapterNumber=5&limit=100`);
  const critFindingBefore = ((critBefore.body as { findings?: Array<Record<string, unknown>> }).findings ?? []).find((f) => f.id === CRIT);
  out["crit-newText-before-discuss"] = (critFindingBefore as { newText?: string })?.newText ?? null;

  const d1 = await api("POST", `/api/books/${BOOK_ID}/editorial/findings/${CRIT}/discuss`, {
    writerMessage:
      "I hear you, but I want to keep one moment of beauty here — every book gets one romantic flare and this sunset is mine. It's pretty. Can't we leave it?",
  });
  out["discuss-crit-holdground"] = d1;
  saveTranscript("discuss-crit-holdground-b48e321f.json", d1.body);

  // Did the revisedSuggestion (if any) persist onto the finding? (D-41b)
  const critAfter = await api("GET", `/api/books/${BOOK_ID}/editorial/findings?chapterNumber=5&limit=100`);
  const critFindingAfter = ((critAfter.body as { findings?: Array<Record<string, unknown>> }).findings ?? []).find((f) => f.id === CRIT);
  out["crit-newText-after-discuss"] = (critFindingAfter as { newText?: string })?.newText ?? null;
  out["D41b-revisedSuggestion-persisted"] =
    out["crit-newText-before-discuss"] !== out["crit-newText-after-discuss"];

  // --- Discuss adapt on the dangler (argue deliberate cognitive slippage) ---
  const d2 = await api("POST", `/api/books/${BOOK_ID}/editorial/findings/${DANGLER}/discuss`, {
    writerMessage:
      "This dangling modifier is deliberate — the narrator is exhausted climbing the steps and her attention is slipping. It mirrors her fatigue. Please preserve it.",
  });
  out["discuss-dangler-adapt"] = d2;
  saveTranscript("discuss-dangler-adapt-42e70291.json", d2.body);

  // --- D-41a: destructive apply guard (blank overrideText → 422) ---
  out["D41a-destructive-apply-blank"] = await api(
    "PATCH",
    `/api/books/${BOOK_ID}/editorial/findings/${PALPABLE}`,
    { action: "apply", overrideText: "   " }
  );

  // --- Real apply: apply the palpable fix via overrideText (in-voice removal) ---
  const contentBefore = nfc(((await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`)).body as { markdown?: string; version?: number }).markdown ?? "");
  const verBefore = ((await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`)).body as { version?: number }).version;
  const applyOverride = "There was a silence on the shingle while I stood with my hand on her gunwale and worked out which of those facts I would mention to him first.";
  const applyRes = await api("PATCH", `/api/books/${BOOK_ID}/editorial/findings/${PALPABLE}`, {
    action: "apply",
    overrideText: applyOverride,
  });
  out["apply-palpable"] = applyRes;
  const contentAfterRes = await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`);
  const contentAfter = nfc((contentAfterRes.body as { markdown?: string }).markdown ?? "");
  const verAfter = (contentAfterRes.body as { version?: number }).version;
  out["apply-effect"] = {
    versionBefore: verBefore,
    versionAfter: verAfter,
    versionBumped: verAfter === (verBefore ?? 0) + 1,
    palpableRemoved: !contentAfter.includes("palpable") && contentBefore.includes("palpable"),
    // exact-span: only the palpable span changed; everything else identical
    onlyExpectedDelta: contentAfter === contentBefore.replace(
      "There was a palpable silence on the shingle while I stood with my hand on her gunwale and worked out which of those facts I would mention to him first.",
      applyOverride
    ),
    // devices preserved after apply
    v1_andstack_intact: contentAfter.includes("the rope and the ring and the salt that held them together"),
    v6_wit_intact: contentAfter.includes("A boat with no oars arrives the way a bill arrives"),
  };

  saveTrace("p2-discuss-apply.json", out);
  console.log("D42 session-status:", (out["D42-session-status-get"] as { status: number }).status);
  console.log("D39 finding bad-action:", JSON.stringify((out["D39-finding-bad-action-real"] as { status: number; body: unknown }).body));
  console.log("discuss-crit status:", (d1 as { status: number }).status);
  console.log("D41b persisted:", out["D41b-revisedSuggestion-persisted"]);
  console.log("discuss-dangler status:", (d2 as { status: number }).status);
  console.log("D41a blank-apply status:", (out["D41a-destructive-apply-blank"] as { status: number; body: unknown }).status, JSON.stringify((out["D41a-destructive-apply-blank"] as { body: unknown }).body));
  console.log("apply-palpable status:", (applyRes as { status: number }).status);
  console.log("apply-effect:", JSON.stringify(out["apply-effect"], null, 1));
}
main().catch((e) => {
  console.error("ERR", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
