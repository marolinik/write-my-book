// UDG round-4: Local-model evidence for the FOURTH 20-persona QA cycle.
//
// The user requires QA cycles to run on a LOCAL model (never remote tokens).
// This script proves routing stays on the local gateway when WMB_LLM_FORCE_LOCAL=1
// and captures REAL local-model output for the round-4 surfaces:
//   - series continuity (Olivera/Filip): next volume + continuity thread
//   - per-line-editor profile (Elena): a "go_pub" style line note
//
// Run (gateway up — local-llm-proxy on 127.0.0.1:30400):
//   npx tsx --env-file=.env cowork/udg-round4/evidence/local-model-qa-r4.ts
//   (with WMB_LLM_FORCE_LOCAL=1 + WMB_LOCAL_PROXY_URL=http://127.0.0.1:30400)
//
// READ-ONLY.
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";

const OUT =
  process.argv[2] || "cowork/udg-round4/evidence/local-model-qa-r4.json";
const proxyUrl = process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose:
    "UDG round-4 20-persona QA — LOCAL-model evidence, local gateway only.",
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

  // Call 1: series next volume (Olivera/Filip surface).
  const series = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 350,
    system:
      "You are a series editor. Given volumes (number, status) and volume-1 synopsis, " +
      "return the next volume number to start + one continuity thread to carry + one sentence of advice.",
    messages: [
      {
        role: "user",
        content:
          "VOLUMES:\n1: complete\n2: complete\n3: writing\n4: concept\n" +
          "SYNOPSIS VOL 1: A lighthouse keeper discovers the sea near the cove is slowly rewinding time.",
      },
    ],
  });
  report.calls.seriesNextVolume = {
    modelId: effectiveModelId,
    stopReason: series.stop_reason,
    usage: series.usage,
    plan: series.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text?: string }).text ?? "")
      .join(""),
  };

  // Call 2: go_pub line-edit profile note (Elena surface).
  const line = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 320,
    system:
      "You are a line editor in 'go to publish' mode: flag clich\xe9, hedged, or flat sentences; " +
      "tighten wordiness; enforce consistent POV/tense. Return 2 terse numbered fixes. No preamble.",
    messages: [
      {
        role: "user",
        content:
          "She walked into the room and saw that it was very dark and quiet, which somehow felt like a kind of " +
          "fateful turning point in her life that she would always remember no matter what happened next.",
      },
    ],
  });
  report.calls.lineEditorProfileGoPub = {
    modelId: effectiveModelId,
    stopReason: line.stop_reason,
    usage: line.usage,
    note: line.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text?: string }).text ?? "")
      .join(""),
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Routing: ${baseURL} (local gateway: ${report.checks.clientRouting.routedToLocalGateway})`);
}

main().catch((e) => {
  console.error("local-model-qa-r4 failed:", e);
  process.exit(1);
});