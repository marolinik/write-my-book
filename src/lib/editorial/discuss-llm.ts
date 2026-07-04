import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { createLLMClient, resolveCheapModelFor } from "@/lib/llm";

/** One cheap, tool-less turn. Returns the raw model text.
 *
 *  BYOK key resolution mirrors src/app/api/books/[id]/agent/[sessionId]/message/route.ts:134-142
 *  (fetch validated db.apiKey rows, decryptApiKey per provider, no platform-key fallback) and the
 *  client.messages.create(...) call shape + text-block extraction used by that route and by
 *  src/app/api/books/[id]/character-chat/route.ts:131-139. Kept isolated here (rather than in the
 *  route handler) so the route's db surface matches the mocked shape in
 *  tests/unit/finding-discuss-route.test.ts, and so this remains the ONLY place that touches the
 *  model — the pure prompt/parser/view modules stay testable without a network dependency. */
export async function runDiscussTurn(args: {
  system: string;
  user: string;
  userId: string;
}): Promise<string> {
  const userKeys = await db.apiKey.findMany({
    where: { userId: args.userId, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  let anthropicApiKey: string | undefined;
  let openrouterApiKey: string | undefined;
  for (const k of userKeys) {
    if (k.provider === "anthropic") anthropicApiKey = decryptApiKey(k.encryptedKey);
    if (k.provider === "openrouter") openrouterApiKey = decryptApiKey(k.encryptedKey);
  }

  // Pick the cheap ("haiku"-tier) variant for the user's OWN provider — mirrors
  // inline-edit/route.ts:45-46. Hardcoding anthropic/haiku here 400/500'd every
  // Discuss turn for OpenRouter-only BYOK users (the mission's qwen config).
  const dbUser = await db.user.findUnique({
    where: { id: args.userId },
    select: { defaultModel: true },
  });
  const cheapModel = resolveCheapModelFor(dbUser?.defaultModel ?? "anthropic/sonnet");

  const { client, model } = createLLMClient({
    modelId: cheapModel.id,
    anthropicApiKey,
    openrouterApiKey,
  });

  const response = await client.messages.create({
    model: model.modelId,
    max_tokens: 700,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}
