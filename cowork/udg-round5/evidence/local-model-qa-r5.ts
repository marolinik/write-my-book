// UDG round-5: Local-model evidence for the FIFTH 20-persona QA cycle.
//
// Local-only (WMB_LLM_FORCE_LOCAL=1 -> local-llm-proxy 127.0.0.1:30400 -> Qwen).
// Captures real local-model output on round-5 surfaces:
//   - story-beats-from-synopsis (Katarina): beat sheet guidance
//   - cover + export front matter (Igor): no LLM needed; covered by unit build
//   - keep-going/current-chapter (Bojan): deterministic, no LLM needed
//
// Run:
//   npx tsx --env-file=.env cowork/udg-round5/evidence/local-model-qa-r5.ts
//   (with WMB_LLM_FORCE_LOCAL=1 + WMB_LOCAL_PROXY_URL=http://127.0.0.1:30400)
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";

const OUT =
  process.argv[2] || "cowork/udg-round5/evidence/local-model-qa-r5.json";
const proxyUrl = process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose: "UDG round-5 20-persona QA — LOCAL-model evidence.",
  env: { WMB_LLM_FORCE_LOCAL: process.env.WMB_LLM_FORCE_LOCAL, WMB_LOCAL_PROXY_URL: proxyUrl },
  checks: {},
  calls: {},
};

function assertLocalMode(): void {
  if (process.env.WMB_LLM_FORCE_LOCAL !== "1") {
    throw new Error("WMB_LLM_FORCE_LOCAL != 1 — refusing to run.");
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
    localGatewayExpected: "http://127.0.0.1:30400",
    routedToLocalGateway: baseURL.includes("127.0.0.1:30400"),
  };

  // Call 1: synopsis -> chapter beat sheet (Katarina). Use modest budget; works
  // better with a concrete, bounded instruction than an open-ended one.
  const beats = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 300,
    system:
      "You are a scene planner. Read a short synopsis and emit a compact chapter-level beat sheet: " +
      "one line per beat (Hook, Escalate, Turn, Setback, Climax, Cliffhanger). No preamble.",
    messages: [
      {
        role: "user",
        content:
          "SYNOPSIS: A lighthouse keeper on a remote cove discovers the sea is slowly rewinding time. " +
          "As past ships reappear, she must decide whether to save a doomed sailor she loved.",
      },
    ],
  });
  report.calls.storyBeats = {
    modelId: effectiveModelId,
    stopReason: beats.stop_reason,
    usage: beats.usage,
    text: beats.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text?: string }).text ?? "")
      .join(""),
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Routing: ${baseURL} (local gateway: ${report.checks.clientRouting.routedToLocalGateway})`);
}

main().catch((e) => {
  console.error("local-model-qa-r5 failed:", e);
  process.exit(1);
});