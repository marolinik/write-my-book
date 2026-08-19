// Fresh-process reproduction of the ghost-text + inline-edit route logic (bypasses
// the STALE live web server) to PROVE the Free AI moat works once the fix is loaded:
//  - the metering gate (checkQuota -> checkDailyMeter -> db.freeTierUsage) CLEARS,
//  - Sam's seeded OpenRouter key resolves a real provider route (not "none"),
//  - a genuine OpenRouter (qwen) call returns a real suggestion.
// This mirrors the route body but is READ-ONLY: it does NOT write usageRecord rows
// or increment the daily meter (no state mutation). The live HTTP route additionally
// meters on success. Secrets/keys are never printed (only key LENGTH + provider).
// Run:  npx tsx --env-file=.env <thisfile> <outfile>
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { checkQuota } from "@/lib/billing/quota-checker";
import { decryptApiKey } from "@/lib/encryption";
import { createLLMClient, resolveProviderRoute, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";

const OUT = process.argv[2] || "./repro-ai-assist.json";
const CLERK_ID = "user_qa_p5";
const BOOK_ID = "35ff1112-52af-4001-a0f4-ec83f4dad9b0";
const report: Record<string, unknown> = { capturedAt: new Date().toISOString(), note: "fresh-process reproduction (bypasses stale live server); READ-ONLY (no meter/usage writes)", steps: {} };
const steps = report.steps as Record<string, unknown>;

async function loadKeys(userId: string) {
  const userKeys = await db.apiKey.findMany({
    where: { userId, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  const decrypted: Partial<Record<ProviderKey, string>> = {};
  for (const k of userKeys) decrypted[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
  return decrypted;
}

async function main() {
  const sam = await db.user.findUnique({ where: { clerkId: CLERK_ID }, select: { id: true, defaultModel: true } });
  if (!sam) { steps.error = "no Sam"; return; }
  steps.samUserId = sam.id;
  steps.defaultModel = sam.defaultModel;

  // 1) Metering gate (the LIVE blocker) — must clear in a fresh process
  const q = await checkQuota(sam.id, "ghost_text");
  steps.ghostQuota = { allowed: q.allowed, isFree: q.isFree, remainingToday: q.remainingToday, reason: q.reason };
  const qi = await checkQuota(sam.id, "inline_edit");
  steps.inlineQuota = { allowed: qi.allowed, isFree: qi.isFree, remainingToday: qi.remainingToday, reason: qi.reason };

  // 2) Provider route resolution (Sam's seeded OpenRouter key)
  const userDefault = sam.defaultModel ?? "anthropic/sonnet";
  const cheapModel = resolveCheapModelFor(userDefault);
  const keys = await loadKeys(sam.id);
  steps.keyProvidersPresent = Object.fromEntries(Object.entries(keys).map(([p, v]) => [p, { present: true, len: v.length }]));
  steps.cheapModel = { id: cheapModel.id, provider: cheapModel.provider, modelId: cheapModel.modelId };
  const route = resolveProviderRoute(cheapModel.provider as ProviderKey, {
    anthropicApiKey: keys.anthropic, openrouterApiKey: keys.openrouter,
    openaiApiKey: keys.openai, geminiApiKey: keys.gemini, grokApiKey: keys.grok,
  });
  steps.resolvedRoute = route.route; // "none" would mean no usable key

  if (route.route === "none" || !q.allowed) return;

  const { client, model } = createLLMClient({
    modelId: cheapModel.id,
    anthropicApiKey: keys.anthropic, openrouterApiKey: keys.openrouter,
    openaiApiKey: keys.openai, geminiApiKey: keys.gemini, grokApiKey: keys.grok,
  });

  // 3) REAL ghost-text call (same prompt shape as the route)
  try {
    const gt = await client.messages.create({
      model: model.modelId,
      max_tokens: 60,
      system: "Continue this fiction prose in the author's voice; at most one sentence. Respond with ONLY the continuation text.",
      messages: [{ role: "user", content: "Sam opened the notebook and began to write. The words came" }],
    });
    const tb = gt.content.find((b) => b.type === "text");
    steps.ghostText = {
      ok: true, model: model.id, stopReason: gt.stop_reason,
      tokens: { input: gt.usage.input_tokens, output: gt.usage.output_tokens },
      suggestion: tb && "text" in tb ? (tb as { text: string }).text.trim() : "",
    };
  } catch (e) {
    steps.ghostText = { ok: false, name: (e as Error).name, message: String((e as Error).message).slice(0, 600) };
  }

  // 4) REAL inline-edit call (3 rewrites, JSON array)
  try {
    const ie = await client.messages.create({
      model: model.modelId,
      max_tokens: 1024,
      system: 'You are a fiction prose editor. Provide 3 alternative rewrites of the selected text. Respond with ONLY a JSON array; each element has "text" and "label". No markdown.',
      messages: [{ role: "user", content: "<selected_text>The words came easily now</selected_text>\nInstruction: make it more vivid. Provide 3 rewrites as a JSON array." }],
    });
    const tb = ie.content.find((b) => b.type === "text");
    const raw = tb && "text" in tb ? (tb as { text: string }).text : "[]";
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()); } catch { /* keep raw */ }
    steps.inlineEdit = {
      ok: true, model: model.id, stopReason: ie.stop_reason,
      tokens: { input: ie.usage.input_tokens, output: ie.usage.output_tokens },
      suggestions: parsed, rawIfUnparsed: parsed ? undefined : raw.slice(0, 800),
    };
  } catch (e) {
    steps.inlineEdit = { ok: false, name: (e as Error).name, message: String((e as Error).message).slice(0, 600) };
  }
}

main()
  .catch((e) => { report.fatal = { name: (e as Error).name, message: String((e as Error).message).slice(0, 800) }; })
  .finally(async () => {
    await db.$disconnect().catch(() => {});
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
