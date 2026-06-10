import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { createLLMClient, resolveProviderRoute, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import { ghostTextRequestSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/ghost-text — get a short AI continuation for the text before the cursor. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await req.json();
    const data = ghostTextRequestSchema.parse(body);

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, language: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check monthly usage quota
    const quotaResult = await checkQuota(user.id, "use_agent_session");
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: quotaResult.reason },
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

    const tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };

    // Record usage with registry ID
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

    return NextResponse.json({ suggestion });
  } catch (error) {
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
