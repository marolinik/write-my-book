import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
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
/** Provider-reported token usage, summed across every attempt this turn made. */
interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  /** False when the provider returned no usage object on some attempt. */
  reported: boolean;
}

export async function runDiscussTurn(args: {
  system: string;
  user: string;
  userId: string;
  /** Book the turn is charged against — the usage row is book-scoped (D-172). */
  bookId: string;
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
    // The SDK types `usage` as always present; real proxy routes sometimes omit
    // it, and an unreported attempt must be visible rather than silently 0.
    const reported = response.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    const textBlock = response.content.find((b) => b.type === "text");
    return {
      text: textBlock && "text" in textBlock ? textBlock.text : "",
      stopReason: response.stop_reason,
      usage: {
        inputTokens: reported?.input_tokens ?? 0,
        outputTokens: reported?.output_tokens ?? 0,
        reported: !!reported,
      } satisfies TurnUsage,
    };
  };

  const first = await requestTurn(DISCUSS_MAX_TOKENS);
  if (first.text.trim()) {
    await recordDiscussUsage(args, model.id, first.usage);
    return first.text;
  }

  // No usable text AND the budget was exhausted → the reasoning blocks ate the
  // whole budget before a text block could start. Retry ONCE with double the
  // room. Any other stop_reason with empty text is a hard model fault — a
  // bigger budget won't change it, so fall straight through to the throw.
  const second =
    first.stopReason === "max_tokens" ? await requestTurn(DISCUSS_MAX_TOKENS * 2) : undefined;
  if (second?.text.trim()) {
    // D-172: the first attempt was a real charge too — bill both, never just the
    // response that happened to land.
    await recordDiscussUsage(args, model.id, sumUsage(first.usage, second.usage));
    return second.text;
  }

  // Unusable result → no usage row, matching the deliberate D-04/D-38 line that
  // a call which delivered nothing is not billed to the writer (the route also
  // refunds the discussion turn). The provider spend on a failed turn therefore
  // stays invisible in-app; that is the honest failure direction here, but it IS
  // a residual gap, so leave a trace in the server log rather than nothing.
  const spent = second ? sumUsage(first.usage, second.usage) : first.usage;
  console.warn("[discuss] turn produced no usable text — not billed", {
    userId: args.userId,
    bookId: args.bookId,
    model: model.id,
    tokensInput: spent.inputTokens,
    tokensOutput: spent.outputTokens,
  });
  throw new DiscussLLMEmptyError();
}

/** Fold two attempts' usage into one total (new object, never mutated). */
function sumUsage(a: TurnUsage, b: TurnUsage): TurnUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reported: a.reported && b.reported,
  };
}

/**
 * D-172: bill-at-settle for a discuss turn — one `usage_records` row written
 * AFTER the turn produced usable text, mirroring the ghost-text / inline-edit
 * pattern (registry model id per D-44, cost from the shared estimator).
 *
 * A billing failure must never destroy the writer's turn: it is logged with
 * full context and swallowed, exactly as quick-assist does post-delivery. The
 * turn is already paid for upstream — losing it to a DB hiccup would be strictly
 * worse for the writer than an under-counted spend panel.
 */
async function recordDiscussUsage(
  args: { userId: string; bookId: string },
  registryModelId: string,
  usage: TurnUsage
): Promise<void> {
  if (!usage.reported) {
    // Some proxy routes omit `usage`. Record the call anyway (so the turn is not
    // invisible) and say plainly that the token counts are under-reported.
    console.warn("[discuss] provider reported no token usage — recording turn with known tokens only", {
      userId: args.userId,
      bookId: args.bookId,
      model: registryModelId,
      tokensInput: usage.inputTokens,
      tokensOutput: usage.outputTokens,
    });
  }
  try {
    await db.usageRecord.create({
      data: {
        userId: args.userId,
        bookId: args.bookId,
        agentType: "discuss",
        model: registryModelId,
        tokensInput: usage.inputTokens,
        tokensOutput: usage.outputTokens,
        costEstimate: estimateCost(registryModelId, usage.inputTokens, usage.outputTokens),
      },
    });
  } catch (err) {
    console.error("[discuss] usage record write failed — turn delivered unbilled", {
      userId: args.userId,
      bookId: args.bookId,
      model: registryModelId,
      err,
    });
  }
}
