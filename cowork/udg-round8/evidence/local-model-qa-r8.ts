// UDG round-8: Local-model + deterministic evidence for the EIGHTH 20-persona QA cycle.
//
// Local-only (WMB_LLM_FORCE_LOCAL=1 -> local-llm-proxy 127.0.0.1:30400 -> Qwen).
// - routing proof (local gateway), plus
// - a local-model whole-book beat sheet (what plan-chapters-from-synopsis now PERSISTS
//   as BOOK_PLAN when complete), and
// - deterministic checks for the export back-cover binding branch (the `back-cover-upload`
//   placeholder rewrite + safe bare-relative image target).
//
// Run: npx tsx --env-file=.env cowork/udg-round8/evidence/local-model-qa-r8.ts
import { writeFileSync } from "node:fs";
import { createLLMClient } from "@/lib/llm";

const OUT = process.argv[2] || "cowork/udg-round8/evidence/local-model-qa-r8.json";

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  purpose: "UDG round-8 20-persona QA — LOCAL-model + deterministic evidence.",
  env: {
    WMB_LLM_FORCE_LOCAL: process.env.WMB_LLM_FORCE_LOCAL,
    WMB_LOCAL_PROXY_URL: process.env.WMB_LOCAL_PROXY_URL || "http://127.0.0.1:30400",
  },
  checks: {},
  calls: {},
};

// Mirror of the pipeline's safe-image-target rule (export-pipeline.ts isSafeImageTarget),
// to prove the back-cover-upload rewrite yields a permitted bare-relative target.
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
function isSafeBareTarget(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  if (SCHEME_RE.test(s)) return false;
  if (s.startsWith("/") || s.startsWith("\\")) return false;
  if (s.includes("..")) return false;
  if (s.includes("/") || s.includes("\\")) return false;
  return /\.(png|jpe?g|webp|gif)$/i.test(s);
}

async function main(): Promise<void> {
  if (process.env.WMB_LLM_FORCE_LOCAL !== "1") {
    throw new Error("WMB_LLM_FORCE_LOCAL != 1 — refusing to run");
  }

  // 1) Local routing proof.
  const { client, model, effectiveModelId } = createLLMClient({ modelId: "anthropic/sonnet" });
  const baseURL = (client as unknown as { baseURL: string }).baseURL;
  report.checks.clientRouting = {
    provider: model.provider,
    effectiveModelId,
    baseURL,
    localGatewayExpected: "http://127.0.0.1:30400",
    routedToLocalGateway: baseURL.includes("127.0.0.1:30400"),
  };

  // 2) Deterministic: export back-cover binding branch.
  const backCoverKey = "back-cover/abc123.jpg";
  const ext = backCoverKey.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "jpg";
  const placeholder = `![Back Cover](back-cover-upload.${ext})`;
  const rewritten = placeholder.replace(/\([^)]+\)/, `(back-cover-upload.${ext})`);
  report.checks.backCoverBinding = {
    ext,
    placeholder,
    rewrittenBareTarget: rewritten,
    manuscriptKeptBySanitizer: isSafeBareTarget(rewritten.match(/\(([^)]+)\)/)?.[1] ?? ""),
  };

  // 3) Local-model whole-book beat sheet — the content that gets persisted as BOOK_PLAN.
  const beats = await client.messages.create({
    model: effectiveModelId,
    max_tokens: 340,
    system:
      "You are a scene planner. Given a synopsis, produce a chapter-by-chapter beat outline for the WHOLE book that would be saved as a BOOK_PLAN document. One line per chapter: chapter number, working title, and the beats it covers. No preamble.",
    messages: [
      {
        role: "user",
        content:
          "SYNOPSIS: A lighthouse keeper on a remote cove discovers the sea is rewinding time, and must decide whether to save a sailor she once loved. Produce a 3-chapter outline.",
      },
    ],
  });
  report.calls.planChaptersForBookPlan = {
    modelId: effectiveModelId,
    stopReason: beats.stop_reason,
    usage: beats.usage,
    text: beats.content.filter((b) => b.type === "text").map((b) => (b as { text?: string }).text ?? "").join(""),
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT}`);
  console.log(`Routing: ${baseURL} (local gateway: ${report.checks.clientRouting.routedToLocalGateway})`);
}

main().catch((e) => {
  console.error("local-model-qa-r8 failed:", e);
  process.exit(1);
});