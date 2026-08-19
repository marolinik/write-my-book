// Diagnose WHY Sam's seeded model returns empty ghost-text at max_tokens=60.
// Dumps the response content block types (is it emitting reasoning/thinking blocks
// that eat the 60-token budget?) and retries at a larger budget to see if real text
// emerges. Determines whether the Free AI moat yields a usable suggestion once the
// server is restarted, or a 502 "cut off" retry loop with this model.
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { createLLMClient, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";

const OUT = process.argv[2] || "./repro-ai-diagnostic.json";
const CLERK_ID = "user_qa_p5";
const report: Record<string, unknown> = { capturedAt: new Date().toISOString(), calls: [] };
const calls = report.calls as unknown[];

async function main() {
  const sam = await db.user.findUnique({ where: { clerkId: CLERK_ID }, select: { id: true, defaultModel: true } });
  if (!sam) { report.error = "no Sam"; return; }
  const keys = await db.apiKey.findMany({ where: { userId: sam.id, validatedAt: { not: null } }, select: { provider: true, encryptedKey: true } });
  const dec: Partial<Record<ProviderKey, string>> = {};
  for (const k of keys) dec[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
  const cheap = resolveCheapModelFor(sam.defaultModel ?? "anthropic/sonnet");
  const { client, model } = createLLMClient({
    modelId: cheap.id, anthropicApiKey: dec.anthropic, openrouterApiKey: dec.openrouter,
    openaiApiKey: dec.openai, geminiApiKey: dec.gemini, grokApiKey: dec.grok,
  });
  report.model = { id: model.id, modelId: model.modelId };

  for (const maxTokens of [60, 400]) {
    try {
      const r = await client.messages.create({
        model: model.modelId, max_tokens: maxTokens,
        system: "Continue this fiction prose in the author's voice; at most one sentence. Respond with ONLY the continuation text.",
        messages: [{ role: "user", content: "Sam opened the notebook and began to write. The words came" }],
      });
      const blocks = (r.content as unknown as Array<Record<string, unknown>>).map((b) => ({
        type: b.type,
        textLen: typeof b.text === "string" ? (b.text as string).length : undefined,
        textSample: typeof b.text === "string" ? (b.text as string).slice(0, 200) : undefined,
      }));
      calls.push({ maxTokens, stopReason: r.stop_reason, tokens: { input: r.usage.input_tokens, output: r.usage.output_tokens }, blockTypes: blocks.map((b) => b.type), blocks });
    } catch (e) {
      calls.push({ maxTokens, error: { name: (e as Error).name, message: String((e as Error).message).slice(0, 500) } });
    }
  }
}

main()
  .catch((e) => { report.fatal = String((e as Error).message).slice(0, 600); })
  .finally(async () => { await db.$disconnect().catch(() => {}); writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); });
