// UDG round-2: Local-model evidence for the 20-persona QA cycle.
//
// The user requires the second QA cycle to run on a LOCAL model (never remote
// tokens). This script proves the app's model path routes through the local
// gateway when WMB_LLM_FORCE_LOCAL=1, and captures REAL local-model outputs for
// the surfaces added in UDG round 2 (line-edit synopsis context, ghost-text
// continuation, dev-edit-style review).
//
// Run (gateway must be up — `local-llm-proxy` on 127.0.0.1:30400, which the
// compose stack already publishes):
//   npx tsx --
//     env-file=.env cowork/udg-round2/evidence/local-model-qa.ts
//   (with WMB_LLM_FORCE_LOCAL=1 + WMB_LOCAL_PROXY_URL=http://127.0.0.1:30400 in
//   the process env or the command line)
//
// READ-ONLY: no writes to usageRecord / daily meters / DB.
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";

const OUT =
  process.argv[2] ||
  "cowork/udg-round2/evidence/local-model-qa.json";

const proxyUrl = process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose:
    "UDG round-2 20-persona QA — LOCAL-model evidence. Every call below is routed " +
    "through the local gateway (WMB_LLM_FORCE_LOCAL=1).",
  env: {
    WMB_LLM_FORCE_LOCAL: process.env.WMB_LLM_FORCE_LOCAL,
    WMB_LOCAL_PROXY_URL: proxyUrl,
  },
  checks: {},
};

// Ensure the kill-switch is on; otherwise bail loudly (must NEVER hit a remote model).
function assertLocalMode(): void {
  if (process.env.WMB_LLM_FORCE_LOCAL !== "1") {
    throw new Error(
      "WMB_LLM_FORCE_LOCAL != 1 — refusing to run. Export it and re-run."
    );
  }
}

async function main(): Promise<void> {
  assertLocalMode();

  const { client, model, effectiveModelId } = createLLMClient({ modelId: "anthropic/sonnet" });
  const baseURL = (client as unknown as { baseURL: string }).baseURL;
  report.checks.clientRouting = {
    provider: model.provider,
    registryId: model.id,
    effectiveModelId,
    baseURL,
    localGatewayExpected: `http://127.0.0.1:30400`,
    routedToLocalGateway: baseURL.includes("127.0.0.1:30400"),
  };

  // ── Call 1: ghost-text-style prose continuation (quick-assist budget) ──
  const continuation = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 60,
    system:
      "Continue this fiction prose in the author's voice; at most one sentence. " +
      "Never use AI-tell phrases: 'delve', 'tapestry'. Respond with ONLY the text.",
    messages: [
      {
        role: "user",
        content:
          "Mara pulled the ledger from the shelf and ran her thumb along the worn spine. The first entry read:",
      },
    ],
  });
  const continuationText = continuation.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text?: string }).text ?? "")
    .join("");
  report.calls = {
    ghostText: {
      modelId: effectiveModelId,
      stopReason: continuation.stop_reason,
      usage: continuation.usage,
      suggestion: continuationText,
    },
  };

  // ── Call 2: line-edit style review WITH story synopsis in context ──
  // Mirrors the UDG-4 toggle: an editor feeding the synopsis so line-level
  // notes stay consistent with the plot (the future line-editor context).
  const review = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 400,
    system:
      "You are a careful line editor. Given a story synopsis and one paragraph, " +
      "return 2-3 terse, concrete prose fixes (sentence-level) that fit the plot. " +
      "No preamble, no markdown headings, just numbered fixes.",
    messages: [
      {
        role: "user",
        content:
          "SYNOPSIS: A lighthouse keeper discovers the sea is slowly rewinding time near the cove; each night the tide reveals an older shore. " +
          "PARAGRAPH: The keeper walked to the window and looked at the water. It was very much the same as it had always been, and she felt a wave of vague unease about yesterday and what it might bring tomorrow. The lamp hummed, quietly, in the dark.",
      },
    ],
  });
  const reviewText = review.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text?: string }).text ?? "")
    .join("");
  report.calls.lineEditWithSynopsis = {
    modelId: effectiveModelId,
    stopReason: review.stop_reason,
    usage: review.usage,
    review: reviewText,
  };

  // ── Call 3: dev-edit style substantive note (plot/continuity-aware) ──
  const dev = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 300,
    system:
      "You are a developmental editor. In two short sentences, give one actionable " +
      "structural note for a chapter based on the synopsis.",
    messages: [
      {
        role: "user",
        content:
          "SYNOPSIS: A detective in a flooded city must decide whether to save the archive of testimony or the last working pump. " +
          "CHAPTER: The detective stands in the archive, water at his knees, papers dissolving. His partner argues the pump can be fixed. He says nothing and begins wading deeper into the stacks.",
      },
    ],
  });
  const devText = dev.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text?: string }).text ?? "")
    .join("");
  report.calls.devEditNote = {
    modelId: effectiveModelId,
    stopReason: dev.stop_reason,
    usage: dev.usage,
    note: devText,
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Routing: ${baseURL} (local gateway: ${report.checks.clientRouting.routedToLocalGateway})`);
}

main().catch((err) => {
  console.error("local-model-qa failed:", err);
  process.exit(1);
});