import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { createLLMClient, resolveProviderRoute, resolveQuickAssistModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import {
  withQuickAssistReasoning,
  extractQuickAssistText,
  settleQuickAssist,
  MODEL_NO_QUICK_SUGGEST_CODE,
  modelNoQuickSuggestMessage,
  QUICK_ASSIST_TIMEOUT_INLINE_MS,
} from "@/lib/llm/quick-assist";
import { inlineEditRequestSchema } from "@/lib/validation";
import type { InlineEditSuggestion } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/inline-edit — get AI rewrite suggestions for selected text. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
    const data = inlineEditRequestSchema.parse(body);

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, language: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check usage quota (free-tier daily inline-edit meter + word/session caps)
    const quotaResult = await checkQuota(user.id, "inline_edit");
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

    // Resolve the quick-assist model for the user's provider (BYOK — no platform
    // key fallbacks). resolveQuickAssistModelFor routes AROUND models flagged
    // unfitForQuickAssist (D-116/D-117): the seeded openrouter-qwen36/* reasoning
    // default can't be disabled and starves the budget, so we substitute the
    // cheapest non-reasoning haiku from the same provider (DeepSeek V3.2 for
    // OpenRouter). Unflagged providers resolve to their usual haiku variant.
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { defaultModel: true },
    });
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
    const cheapModel = resolveQuickAssistModelFor(userDefault);

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
        { error: `No API key configured for inline editing. Add one in Settings > API Keys.` },
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

    // D-100: on the OpenRouter route (where the seeded free-tier default
    // qwen/qwen3.6-27b lives), disable provider reasoning so the output budget
    // isn't burned entirely on thinking blocks. `reasoning` is an OpenRouter
    // parameter — never sent on the direct Anthropic route, which rejects the
    // unknown field (Anthropic gates thinking via `thinking`).
    const baseParams = {
      model: model.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userContent }],
    };
    // D-142: thread req.signal + a bounded timeout so a typing-resumed / closed
    // client abort actually cancels the upstream generation and is caught below
    // (499, unbilled) instead of completing server-side and writing a
    // usage_record for a suggestion no one will ever see. Stage 1 keeps this
    // route atomic JSON (Stage 2 streams it via the shared gate).
    const startedAt = Date.now();
    const response = await client.messages.create(
      route.route === "openrouter"
        ? withQuickAssistReasoning(baseParams)
        : baseParams,
      { signal: req.signal, timeout: QUICK_ASSIST_TIMEOUT_INLINE_MS }
    );

    // Parse the response (extractQuickAssistText skips leading thinking blocks).
    const rawText = extractQuickAssistText(response.content) || "[]";

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

    // D-04/D-38: a request that yields NO usable rewrites is not a billable
    // result. The empty array is often a max_tokens-truncated JSON payload that
    // failed to parse. Do NOT write a usage record for nothing and do NOT
    // answer with a hollow 200 { suggestions: [] }; surface an honest,
    // retryable signal (and the truncation) so the writer can retry.
    const ms = Date.now() - startedAt;
    const timing = { "Server-Timing": `llm;dur=${ms}` };

    if (suggestions.length === 0) {
      // D-100 (migrated to settleQuickAssist, D5): a reasoning model that
      // returned ONLY thinking blocks can't produce quick rewrites at all —
      // answer honestly and point at the model picker, instead of a misleading,
      // infinitely-retryable cut-off. The truncation copy still keys off
      // stop_reason so a text-but-unparseable-JSON reply reads as "cut off".
      if (settleQuickAssist(response.content, response.stop_reason).kind === "reasoning-only") {
        return NextResponse.json(
          {
            error: modelNoQuickSuggestMessage("inline-edit"),
            code: MODEL_NO_QUICK_SUGGEST_CODE,
          },
          { status: 422, headers: timing }
        );
      }
      const truncated = response.stop_reason === "max_tokens";
      return NextResponse.json(
        {
          error: truncated
            ? "The rewrite response was cut off before it could be parsed. Try selecting less text, then try again."
            : "No usable rewrites were generated. Please try again.",
          retryable: true,
        },
        { status: 502, headers: timing }
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
        agentType: "inline-edit",
        model: model.id,
        tokensInput: tokensUsed.input,
        tokensOutput: tokensUsed.output,
        costEstimate: cost,
      },
    });

    // Advance the Free-tier daily meter ONLY after a genuine, billable result
    // (increment-on-success; never on failure — D-36 lesson). No-op for paid.
    if (quotaResult.isFree) {
      await recordDailyUse(user.id, "inline");
    }

    return NextResponse.json(
      { suggestions, tokensUsed, elapsedMs: ms },
      { headers: timing }
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    // D-142: a typing-resumed / navigation abort must not fall through to a 500
    // — it delivered nothing and, having threaded req.signal, was cancelled
    // upstream. Answer 499 (client gone), unbilled, so an aborted inline-edit
    // never writes a usage_record.
    if (req.signal.aborted || (error as Error).name === "AbortError") {
      return new Response(null, { status: 499 });
    }
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
