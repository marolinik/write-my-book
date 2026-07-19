import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { createLLMClient, resolveProviderRoute, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import { ghostTextRequestSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/ghost-text — get a short AI continuation for the text before the cursor. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
    const data = ghostTextRequestSchema.parse(body);

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, language: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check usage quota (free-tier daily ghost-text meter + word/session caps)
    const quotaResult = await checkQuota(user.id, "ghost_text");
    if (!quotaResult.allowed) {
      return NextResponse.json(
        {
          error: quotaResult.reason,
          upgradeToTier: quotaResult.upgradeToTier,
          remainingToday: quotaResult.remainingToday,
        },
        { status: 429 }
      );
    }

    // Resolve the cheap-tier model for the user's preferred provider via the
    // registry (BYOK — no platform key fallbacks). Never string-build the ID:
    // openai/gemini/grok have no "/haiku" entry and a registry miss silently
    // falls back to anthropic/sonnet.
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { defaultModel: true },
    });
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
    const cheapModel = resolveCheapModelFor(userDefault);

    // Load all user keys (no platform key fallbacks)
    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id, validatedAt: { not: null } },
      select: { provider: true, encryptedKey: true },
    });
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
    }

    const route = resolveProviderRoute(cheapModel.provider as ProviderKey, {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });
    if (route.route === "none") {
      return NextResponse.json(
        { error: `No API key configured for ghost text. Add one in Settings > API Keys.` },
        { status: 400 }
      );
    }

    const { client, model } = createLLMClient({
      modelId: cheapModel.id,
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });

    // Build the prompt
    const lang = book.language || "en";
    const langInstruction =
      lang !== "en"
        ? `\nIMPORTANT: Continue in the same language as the original text (${lang}). Do NOT translate.`
        : "";

    const systemPrompt = `Continue this fiction prose in the author's voice; at most one sentence.

Rules:
- Respond with ONLY the continuation text — no quotes, no explanation, no markdown
- Pick up exactly where the text leaves off (continue mid-sentence if the text stops mid-sentence)
- Match the style, tone, and tense of the surrounding prose
- Never use AI-tell phrases: "delve", "tapestry", "testament to", "palpable", "a dance of", "sending shivers"${langInstruction}`;

    const response = await client.messages.create({
      model: model.modelId,
      max_tokens: 60,
      system: systemPrompt,
      messages: [{ role: "user", content: data.context }],
    });

    // Extract the suggestion text
    const textBlock = response.content.find((b) => b.type === "text");
    const suggestion =
      textBlock && "text" in textBlock ? textBlock.text.trim() : "";

    // D-04/D-38: an empty / whitespace-only continuation is not a billable
    // result. It usually means the small (60-token) output budget was fully
    // consumed with no usable text — e.g. a reasoning model emitting only
    // thinking blocks (stop_reason "max_tokens"). Do NOT write a usage record
    // for silence and do NOT answer with a hollow 200; surface an honest,
    // retryable signal so the client can retry instead of paying for nothing.
    if (suggestion.length === 0) {
      const truncated = response.stop_reason === "max_tokens";
      return NextResponse.json(
        {
          error: truncated
            ? "The suggestion was cut off before any text was produced. Please try again."
            : "No suggestion was generated. Please try again.",
          retryable: true,
        },
        { status: 502 }
      );
    }

    const tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };

    // Record usage with registry ID (only for a genuine, non-empty result)
    const cost = estimateCost(model.id, tokensUsed.input, tokensUsed.output);
    await db.usageRecord.create({
      data: {
        userId: user.id,
        bookId,
        agentType: "ghost-text",
        model: model.id,
        tokensInput: tokensUsed.input,
        tokensOutput: tokensUsed.output,
        costEstimate: cost,
      },
    });

    // Advance the Free-tier daily meter ONLY after a genuine, billable result
    // (increment-on-success; never on failure — D-36 lesson). No-op for paid.
    if (quotaResult.isFree) {
      await recordDailyUse(user.id, "ghost");
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
    console.error("POST /api/books/:id/ghost-text error:", (error as Error).message);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
