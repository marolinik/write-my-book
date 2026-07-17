import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { createLLMClient, resolveCheapModelFor } from "@/lib/llm";

/** Token budget for one discuss turn. Reasoning models (the mission's qwen via
 *  OpenRouter) emit thinking blocks that count against max_tokens BEFORE any
 *  text block; the old 700 was routinely consumed entirely by reasoning, so the
 *  response carried no text at all (D-04). */
const DISCUSS_MAX_TOKENS = 2500;

/** Thrown when the model returns no usable text even after the retry with a
 *  doubled budget. The discuss route maps this to an honest 502 and does NOT
 *  consume one of the writer's 3 turns — pre-fix the empty string flowed
 *  through as a 200 with an empty assistantMessage and no REMEMBER block,
 *  silently breaking the discuss→memory→honored loop. */
export class DiscussLLMEmptyError extends Error {
  constructor(message = "Discuss model returned no usable text") {
    super(message);
    this.name = "DiscussLLMEmptyError";
  }
}

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

  const requestTurn = async (maxTokens: number) => {
    const response = await client.messages.create({
      model: model.modelId,
      max_tokens: maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return {
      text: textBlock && "text" in textBlock ? textBlock.text : "",
      stopReason: response.stop_reason,
    };
  };

  const first = await requestTurn(DISCUSS_MAX_TOKENS);
  if (first.text.trim()) return first.text;

  // No usable text AND the budget was exhausted → the reasoning blocks ate the
  // whole budget before a text block could start. Retry ONCE with double the
  // room. Any other stop_reason with empty text is a hard model fault — a
  // bigger budget won't change it, so fall straight through to the throw.
  if (first.stopReason === "max_tokens") {
    const second = await requestTurn(DISCUSS_MAX_TOKENS * 2);
    if (second.text.trim()) return second.text;
  }

  throw new DiscussLLMEmptyError();
}
