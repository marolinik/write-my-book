// UDG round-7: Local-model + deterministic evidence for the SEVENTH 20-persona QA cycle.
//
// Local-only (WMB_LLM_FORCE_LOCAL=1 -> local-llm-proxy 127.0.0.1:30400 -> Qwen).
// Shadows:
//   - local routing still targets the local gateway (proof for every QA round),
//   - the account-less share surface (token generation + validation + rate limiter)
//     which is deterministic server logic (no model required),
//   - a light local-model call to keep the "runs on local model" proof fresh.
//
// Run:
//   npx tsx --env-file=.env cowork/udg-round7/evidence/local-model-qa-r7.ts
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";
import {
  generateShareToken,
  isValidShareToken,
  InMemoryRateLimiter,
  constantTimeEquals,
} from "@/lib/share/token";

const OUT = process.argv[2] || "cowork/udg-round7/evidence/local-model-qa-r7.json";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose: "UDG round-7 20-persona QA — LOCAL-model + deterministic evidence.",
  env: {
    WMB_LLM_FORCE_LOCAL: process.env.WMB_LLM_FORCE_LOCAL,
    WMB_LOCAL_PROXY_URL: process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400",
  },
  checks: {},
  calls: {},
};

async function main(): Promise<void> {
  if (process.env.WMB_LLM_FORCE_LOCAL !== "1") {
    throw new Error("WMB_LLM_FORCE_LOCAL != 1 — refusing to run");
  }

  // 1) Local-model routing proof.
  const { client, model, effectiveModelId } = createLLMClient({ modelId: "anthropic/sonnet" });
  const baseURL = (client as unknown as { baseURL: string }).baseURL;
  report.checks.clientRouting = {
    provider: model.provider,
    effectiveModelId,
    baseURL,
    localGatewayExpected: "http://127.0.0.1:30400",
    routedToLocalGateway: baseURL.includes("127.0.0.1:30400"),
  };

  // 2) Deterministic account-less share checks (Luka 12).
  const token = generateShareToken();
  const second = generateShareToken();
  report.checks.shareToken = {
    generatedLength: token.length,
    looksValidHex: isValidShareToken(token),
    invalidRejected: !isValidShareToken("not-a-token"),
    uniqueness: token !== second,
    constantTimeMatchesItself: constantTimeEquals(token, token),
    constantTimeRejectsDiffLen: !constantTimeEquals(token, token.slice(0, 24)),
  };

  // 3) Rate limiter (public share surface) works per-key.
  const limiter = new InMemoryRateLimiter(60_000, 5);
  let allowed = 0;
  for (let i = 0; i < 8; i++) if (limiter.allow("test-ip")) allowed++;
  report.checks.rateLimiter = { allowedBeforeThrottle: allowed, expectCapAtLimitExceeded: limiter.allow("test-ip") === false };

  // 4) Light local-model call — editorial brief framing (Luka) so we keep a fresh
  //    local-model artifact for the QA doc.
  const brief = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 220,
    messages: [
      {
        role: "user",
        content:
          "List the 3 most common beta-reader findings for a cove-set literary novel, one per line, severity + one-line fix.",
      },
    ],
  });
  report.calls.editorialBriefFraming = {
    modelId: effectiveModelId,
    stopReason: brief.stop_reason,
    usage: brief.usage,
    text: brief.content.filter((b) => b.type === "text").map((b) => (b as { text?: string }).text ?? "").join(""),
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Routing: ${baseURL} (local gateway: ${report.checks.clientRouting.routedToLocalGateway})`);
}

main().catch((e) => {
  console.error("local-model-qa-r7 failed:", e);
  process.exit(1);
});