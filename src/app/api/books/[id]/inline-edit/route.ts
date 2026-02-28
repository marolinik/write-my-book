import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { createLLMClient, resolveProviderRoute } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import { inlineEditRequestSchema } from "@/lib/validation";
import type { InlineEditSuggestion } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/inline-edit — get AI rewrite suggestions for selected text. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await req.json();
    const data = inlineEditRequestSchema.parse(body);

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

    // Resolve user's preferred provider to pick the haiku variant (BYOK — no platform key fallbacks)
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { defaultModel: true },
    });
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
    const provider = userDefault.split("/")[0] || "anthropic";
    const haikuRegistryId = `${provider}/haiku`;

    // Load all user keys (no platform key fallbacks)
    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id, validatedAt: { not: null } },
      select: { provider: true, encryptedKey: true },
    });
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
    }

    const route = resolveProviderRoute(provider as ProviderKey, {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });
    if (route.route === "none") {
      return NextResponse.json(
        { error: `No API key configured for inline editing. Add one in Settings > API Keys.` },
        { status: 400 }
      );
    }

    const { client, model } = createLLMClient({
      modelId: haikuRegistryId,
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
        ? `\nIMPORTANT: Write all suggestions in the same language as the original text (${lang}). Do NOT translate.`
        : "";

    const userInstruction = data.instruction
      ? `\nThe writer's instruction: "${data.instruction}"`
      : "";

    const contextSection = data.surroundingContext
      ? `\n<surrounding_context>\n${data.surroundingContext}\n</surrounding_context>`
      : "";

    const systemPrompt = `You are a fiction prose editor. Given selected text from a manuscript, provide ${data.count} alternative rewrites that improve the prose while maintaining the author's voice and intent.

Rules:
- Each suggestion must be a complete replacement for the selected text
- Preserve the meaning and narrative purpose
- Match the surrounding style and tone
- Vary approaches: one might tighten, another might add sensory detail, another might adjust rhythm
- Never use AI-tell phrases: "delve", "tapestry", "testament to", "palpable", "a dance of", "sending shivers"
- Keep roughly the same length unless the instruction asks otherwise${langInstruction}

Respond with ONLY a JSON array. Each element has "text" (the rewrite) and "label" (2-4 word description like "Tighter pacing" or "More sensory"). No markdown, no explanation.`;

    const userContent = `${contextSection}
<selected_text>
${data.selectedText}
</selected_text>${userInstruction}

Provide ${data.count} alternative rewrites as a JSON array.`;

    const response = await client.messages.create({
      model: model.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    // Parse the response
    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "[]";

    let suggestions: InlineEditSuggestion[];
    try {
      // Strip markdown fences if present
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      suggestions = JSON.parse(cleaned);
      if (!Array.isArray(suggestions)) suggestions = [];
      // Validate shape
      suggestions = suggestions
        .filter(
          (s): s is InlineEditSuggestion =>
            typeof s === "object" &&
            s !== null &&
            typeof s.text === "string" &&
            typeof s.label === "string"
        )
        .slice(0, data.count);
    } catch {
      suggestions = [];
    }

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
        agentType: "inline-edit",
        model: model.id,
        tokensInput: tokensUsed.input,
        tokensOutput: tokensUsed.output,
        costEstimate: cost,
      },
    });

    return NextResponse.json({ suggestions, tokensUsed });
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
    console.error("POST /api/books/:id/inline-edit error:", (error as Error).message);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
