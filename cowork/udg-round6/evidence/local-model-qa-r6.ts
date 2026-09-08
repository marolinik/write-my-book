// UDG round-6: Local-model evidence for the SIXTH 20-persona QA cycle.
//
// Local-only (WMB_LLM_FORCE_LOCAL=1 -> local-llm-proxy 127.0.0.1:30400 -> Qwen).
// Captures real local-model output on round-6 surfaces:
//   - whole-book plan-chapters-from-synopsis (Katarina): chapter-by-chapter outline
// Snapshot/share/cover items are deterministic server pages, covered by unit+CI+E2E.
//
// Run:
//   npx tsx --env-file=.env cowork/udg-round6/evidence/local-model-qa-r6.ts
//   (with WMB_LLM_FORCE_LOCAL=1 + WMB_LOCAL_PROXY_URL=http://127.0.0.1:30400)
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";

const OUT =
  process.argv[2] || "cowork/udg-round6/evidence/local-model-qa-r6.json";
const proxyUrl = process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose: "UDG round-6 20-persona QA — LOCAL-model evidence.",
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

  // Call 1: whole-book chapter-by-chapter beats from a synopsis (Katarina).
  const beats = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 320,
    system:
      "You are a scene planner. Given a synopsis, produce a chapter-by-chapter beat outline for the WHOLE book: " +
      "one compact entry per chapter (working title + Hook/Escalate/Climax beats). One line per chapter. No preamble.",
    messages: [
      {
        role: "user",
        content:
          "SYNOPSIS: A lighthouse keeper on a remote cove discovers the sea is slowly rewinding time. " +
          "As past ships reappear, she must decide whether to save a doomed sailor she loved.\n" +
          "Propose a 4-chapter outline.",
      },
    ],
  });
  report.calls.planChaptersFromSynopsis = {
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
  console.error("local-model-qa-r6 failed:", e);
  process.exit(1);
});