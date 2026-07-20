// D-100 live repro — proves the reasoning-model quick-assist fix.
//
// The live :3002 web server is STALE (cannot be restarted this session), so this
// script does TWO things:
//   (A) hits the live HTTP ghost-text route (persona auth) — captured as-is; and
//   (B) runs the AUTHORITATIVE fresh-process path that imports the NEW code
//       (withQuickAssistReasoning + extractQuickAssistText + isReasoningOnly) and
//       calls Sam's real qwen/qwen3.6-27b model at the ghost-text budget, WITH
//       and WITHOUT the reasoning-disable flag, to show the fix's effect.
//
// READ-ONLY: no usageRecord rows, no daily-meter increments. Secrets never printed
// (only masked first-7+last-4 + length).
// Run:  npx tsx --env-file=.env cowork/.../fix-reviews/d100-live-repro.ts <outfile>
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { createLLMClient, resolveProviderRoute, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import {
  withQuickAssistReasoning,
  extractQuickAssistText,
  isReasoningOnly,
  MODEL_NO_QUICK_SUGGEST_CODE,
  MODEL_NO_QUICK_SUGGEST_MESSAGE,
} from "@/lib/llm/quick-assist";

const OUT =
  process.argv[2] ||
  "cowork/bulletproof-qa-2026-07-17/evidence/fix-reviews/d100-live-repro.json";
const CLERK_ID = "user_qa_p5";
const BOOK_ID = "35ff1112-52af-4001-a0f4-ec83f4dad9b0";
const BASE = "http://localhost:3002";
const GHOST_CONTEXT = "Sam opened the notebook and began to write. The words came";

const mask = (s: string | undefined) =>
  !s ? "(absent)" : `${s.slice(0, 7)}…${s.slice(-4)} (len ${s.length})`;

const report: Record<string, unknown> = {
  capturedAt: new Date().toISOString(),
  defect: "D-100",
  note: "READ-ONLY. (A) live HTTP route on stale :3002; (B) authoritative fresh-process path importing the NEW quick-assist code.",
  steps: {},
};
const steps = report.steps as Record<string, unknown>;

async function loadKeys(userId: string) {
  const rows = await db.apiKey.findMany({
    where: { userId, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  const out: Partial<Record<ProviderKey, string>> = {};
  for (const k of rows) out[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
  return out;
}

/** Classify a model response the way the fixed route does. */
function classify(content: unknown[], stopReason: string | null) {
  const text = extractQuickAssistText(content as never).trim();
  if (text.length > 0) return { outcome: "REAL_SUGGESTION", suggestion: text };
  if (isReasoningOnly(content as never))
    return {
      outcome: "MODEL_NO_QUICK_SUGGEST",
      httpStatus: 422,
      code: MODEL_NO_QUICK_SUGGEST_CODE,
      error: MODEL_NO_QUICK_SUGGEST_MESSAGE,
    };
  return { outcome: "GENERIC_EMPTY_502_RETRYABLE", stopReason };
}

async function main() {
  const secret = process.env.E2E_TEST_SECRET;
  steps.e2eSecret = mask(secret);

  // ── (A) LIVE HTTP route (stale server; captured verbatim) ──────────────
  try {
    const res = await fetch(`${BASE}/api/books/${BOOK_ID}/ghost-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-e2e-test-secret": secret ?? "",
        "x-e2e-clerk-id": CLERK_ID,
      },
      body: JSON.stringify({ context: GHOST_CONTEXT, chapterNumber: 1 }),
    });
    const body = await res.json().catch(() => ({}));
    steps.liveHttp = { status: res.status, code: body.code, body };
  } catch (e) {
    steps.liveHttp = { error: (e as Error).message };
  }

  // ── (B) Authoritative fresh-process path (imports the NEW code) ────────
  const sam = await db.user.findUnique({
    where: { clerkId: CLERK_ID },
    select: { id: true, defaultModel: true },
  });
  if (!sam) {
    steps.freshProcess = { error: "no Sam user" };
    return;
  }
  steps.samDefaultModel = sam.defaultModel;
  const cheapModel = resolveCheapModelFor(sam.defaultModel ?? "anthropic/sonnet");
  const keys = await loadKeys(sam.id);
  steps.keysPresent = Object.keys(keys);
  const route = resolveProviderRoute(cheapModel.provider as ProviderKey, {
    anthropicApiKey: keys.anthropic,
    openrouterApiKey: keys.openrouter,
    openaiApiKey: keys.openai,
    geminiApiKey: keys.gemini,
    grokApiKey: keys.grok,
  });
  steps.cheapModel = { id: cheapModel.id, provider: cheapModel.provider, modelId: cheapModel.modelId };
  steps.resolvedRoute = route.route;
  if (route.route === "none") {
    steps.freshProcess = { error: "route none — no usable key" };
    return;
  }

  const { client, model } = createLLMClient({
    modelId: cheapModel.id,
    anthropicApiKey: keys.anthropic,
    openrouterApiKey: keys.openrouter,
    openaiApiKey: keys.openai,
    geminiApiKey: keys.gemini,
    grokApiKey: keys.grok,
  });

  const baseParams = {
    model: model.modelId,
    max_tokens: 60,
    system:
      "Continue this fiction prose in the author's voice; at most one sentence. Respond with ONLY the continuation text.",
    messages: [{ role: "user" as const, content: GHOST_CONTEXT }],
  };

  // Control: NO reasoning-disable (the old behavior) — expected thinking-only.
  try {
    const r = await client.messages.create(baseParams);
    steps.control_noReasoningFlag = {
      stopReason: r.stop_reason,
      blockTypes: r.content.map((b: { type: string }) => b.type),
      ...classify(r.content as unknown[], r.stop_reason),
    };
  } catch (e) {
    steps.control_noReasoningFlag = { error: (e as Error).message.slice(0, 400) };
  }

  // FIX: reasoning-disable ON (only added on the openrouter route, as the route does).
  try {
    const params =
      route.route === "openrouter" ? withQuickAssistReasoning(baseParams) : baseParams;
    steps.fixRequestReasoningField = (params as { reasoning?: unknown }).reasoning ?? null;
    const r = await client.messages.create(params);
    steps.fix_reasoningDisabled = {
      stopReason: r.stop_reason,
      blockTypes: r.content.map((b: { type: string }) => b.type),
      ...classify(r.content as unknown[], r.stop_reason),
    };
  } catch (e) {
    steps.fix_reasoningDisabled = { error: (e as Error).message.slice(0, 400) };
  }

  // Final verdict: what the FIXED route would return for this user right now.
  const fix = steps.fix_reasoningDisabled as { outcome?: string };
  steps.verdict =
    fix?.outcome === "REAL_SUGGESTION"
      ? "PASS — reasoning-disable produced real suggestion text"
      : fix?.outcome === "MODEL_NO_QUICK_SUGGEST"
        ? "PASS — provider ignored the flag; honest MODEL_NO_QUICK_SUGGEST (422) instead of infinite cut-off loop"
        : "CHECK — unexpected outcome";
}

main()
  .catch((e) => {
    report.fatal = { name: (e as Error).name, message: String((e as Error).message).slice(0, 800) };
  })
  .finally(async () => {
    await db.$disconnect().catch(() => {});
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
