// UDG round-3: Local-model evidence for the THIRD 20-persona QA cycle.
//
// The user requires the QA cycle to run on a LOCAL model (never remote tokens).
// This script proves the app's model path routes through the local gateway when
// WMB_LLM_FORCE_LOCAL=1, and captures REAL local-model outputs for the surfaces
// added in UDG round 3:
//   - UDG-16 (Petar): research requires a provider key -> a local model explains
//     the value of connecting a web-search key (the deeper reason behind the new
//     deep-link to Settings → API Keys).
//   - UDG-6/15 (Filip/Olivera): series continuity -> a local model plans the next
//     volume in a series given per-volume state (what computeSeriesNextBook renders).
//
// Run (gateway must be up — local-llm-proxy on 127.0.0.1:30400):
//   npx tsx --env-file=.env cowork/udg-round3/evidence/local-model-qa-r3.ts
//   (with WMB_LLM_FORCE_LOCAL=1 + WMB_LOCAL_PROXY_URL=http://127.0.0.1:30400)
//
// READ-ONLY: no writes to usageRecord / daily meters / DB.
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";

const OUT =
  process.argv[2] || "cowork/udg-round3/evidence/local-model-qa-r3.json";

const proxyUrl = process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose:
    "UDG round-3 20-persona QA — LOCAL-model evidence. Every call below is routed " +
    "through the local gateway (WMB_LLM_FORCE_LOCAL=1).",
  env: {
    WMB_LLM_FORCE_LOCAL: process.env.WMB_LLM_FORCE_LOCAL,
    WMB_LOCAL_PROXY_URL: proxyUrl,
  },
  checks: {},
  calls: {},
};

function assertLocalMode(): void {
  if (process.env.WMB_LLM_FORCE_LOCAL !== "1") {
    throw new Error(
      "WMB_LLM_FORCE_LOCAL != 1 — refusing to run. Export it and re-run."
    );
  }
}

async function main(): Promise<void> {
  assertLocalMode();

  const { client, model, effectiveModelId } = createLLMClient({
    modelId: "anthropic/sonnet",
  });
  const baseURL = (client as unknown as { baseURL: string }).baseURL;
  report.checks.clientRouting = {
    provider: model.provider,
    registryId: model.id,
    effectiveModelId,
    baseURL,
    localGatewayExpected: "http://127.0.0.1:30400",
    routedToLocalGateway: baseURL.includes("127.0.0.1:30400"),
  };

  // ── Call 1: series continuity planning (Filip/Olivera's next volume) ──
  // Mirrors computeSeriesNextBook: given per-volume state, decide the next volume
  // to start and one continuity thread to carry forward.
  const series = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 450,
    system:
      "You are a series editor. Given a list of a series' volumes (number, status) " +
      "and a synopsis of the first volume, return: the next volume number to start, " +
      "one continuity thread (a character/object/tension) to carry into it, and one " +
      "short sentence of advice. No preamble, no headings.",
    messages: [
      {
        role: "user",
        content:
          "VOLUMES:\n1: complete\n2: complete\n3: writing\n4: concept\n" +
          "SYNOPSIS VOL 1: A lighthouse keeper discovers the sea near the cove is slowly " +
          "rewinding time; each night the tide reveals an older shore.",
      },
    ],
  });
  const seriesText = series.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text?: string }).text ?? "")
    .join("");
  report.calls.seriesNextVolume = {
    modelId: effectiveModelId,
    stopReason: series.stop_reason,
    usage: series.usage,
    plan: seriesText,
  };

  // ── Call 2: research-value grounding (Petar) ──
  // Mirrors UDG-16: why a web-search provider key unlocks the Research stage.
  const research = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 300,
    system:
      "You are a writing-app UX explainer. In at most two short sentences, tell a " +
      "novelist why connecting a web-search provider key (Perplexity/Serper/Firecrawl) " +
      "makes the Research stage of book development genuinely useful.",
    messages: [
      {
        role: "user",
        content:
          "The user has no research key configured yet. They are on the Book Development " +
          "hub and just saw a link to Settings → API Keys.",
      },
    ],
  });
  const researchText = research.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text?: string }).text ?? "")
    .join("");
  report.calls.researchKeyValue = {
    modelId: effectiveModelId,
    stopReason: research.stop_reason,
    usage: research.usage,
    note: researchText,
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(
    `Routing: ${baseURL} (local gateway: ${report.checks.clientRouting.routedToLocalGateway})`
  );
}

main().catch((err) => {
  console.error("local-model-qa-r3 failed:", err);
  process.exit(1);
});