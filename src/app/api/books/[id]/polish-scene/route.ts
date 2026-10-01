import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enforceBookScript } from "@/lib/agents/serbian-script";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { readStoryBible, readVoiceFingerprint } from "@/lib/editorial/book-evidence";
import { createLLMClient, resolveModelForRole, resolveRouteWithLocalFallback } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import {
  USER_MODEL_SELECT,
  bookModelSettingsOf,
  globalOverridesOf,
  userModelSettingsOf,
} from "@/lib/llm/model-resolver";
import { withQuickAssistReasoning, extractQuickAssistText } from "@/lib/llm/quick-assist";
import { getDefaultModelId } from "@/lib/llm/defaults";
import {
  POLISH_INTENSITIES,
  buildPolishSystemPrompt,
  buildPolishUserContent,
  polishMaxTokens,
  settlePolishedText,
  type PolishIntensity,
} from "@/lib/polish/polish-scene";
import { polishSceneRequestSchema } from "@/lib/validation";
import type { PolishSceneFailure, PolishSceneVersion } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** A whole scene on a strong model takes far longer than a quick-assist rewrite. */
const POLISH_TIMEOUT_MS = 240_000;

interface HalfResult {
  intensity: PolishIntensity;
  version?: PolishSceneVersion;
  failure?: PolishSceneFailure;
  tokens: { input: number; output: number };
}

/**
 * POST /api/books/:id/polish-scene — a light and a bold rewrite of the scene
 * the writer selected, on the ghostwriter's model, in the writer's voice and
 * inside the book's canon. The two are asked in parallel and settle on their
 * own: one failure still hands the writer the other version.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
    const data = polishSceneRequestSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, language: true, settings: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Same plan check and Free daily meter as the inline rewrite: one polish
    // is one inline edit on the meter.
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

    // The ghostwriter's model: the one that writes this book's chapters, through
    // the same book-role → book-default → global-role → global-default chain.
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: USER_MODEL_SELECT,
    });
    const resolved = resolveModelForRole(
      "ghostwriter",
      bookModelSettingsOf(book.settings),
      globalOverridesOf(userModelSettingsOf(dbUser)),
      dbUser?.defaultModel ?? getDefaultModelId()
    );

    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id, validatedAt: { not: null } },
      select: { provider: true, encryptedKey: true },
    });
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
    }
    const keys = {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    };

    const { route } = resolveRouteWithLocalFallback(resolved.modelDef, keys);
    if (route.route === "none") {
      return NextResponse.json(
        { error: "No API key configured for this model. Add one in Settings > API Keys." },
        { status: 400 }
      );
    }
    const { client, model } = createLLMClient({ modelId: resolved.registryId, ...keys });

    const [fingerprint, storyBible] = await Promise.all([
      readVoiceFingerprint(bookId).catch(() => null),
      readStoryBible(bookId).catch(() => null),
    ]);

    const lang = book.language || "en";
    const userContent = buildPolishUserContent(data);
    const startedAt = Date.now();

    const runHalf = async (intensity: PolishIntensity): Promise<HalfResult> => {
      const baseParams = {
        model: model.modelId,
        max_tokens: polishMaxTokens(data.selectedText),
        system: buildPolishSystemPrompt({ intensity, language: lang, fingerprint, storyBible }),
        messages: [{ role: "user" as const, content: userContent }],
      };
      try {
        // Reasoning off on the routes that honour it, as for the inline rewrite:
        // a reasoning default can spend the whole budget thinking and return no
        // prose. The direct Anthropic route rejects the unknown field.
        const response = await client.messages.create(
          route.route === "openrouter" || model.provider === "local"
            ? withQuickAssistReasoning(baseParams)
            : baseParams,
          { signal: req.signal, timeout: POLISH_TIMEOUT_MS }
        );
        const tokens = {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        };
        const settled = settlePolishedText(
          extractQuickAssistText(response.content),
          response.stop_reason,
          data.selectedText
        );
        if (!settled.ok) {
          return { intensity, failure: { intensity, reason: settled.reason }, tokens: { input: 0, output: 0 } };
        }
        return {
          intensity,
          version: { intensity, text: enforceBookScript(settled.text, lang) },
          tokens,
        };
      } catch (error) {
        if (!req.signal.aborted) {
          console.error(`polish-scene ${intensity} failed:`, (error as Error).message);
        }
        return { intensity, failure: { intensity, reason: "error" }, tokens: { input: 0, output: 0 } };
      }
    };

    const halves = await Promise.all(POLISH_INTENSITIES.map(runHalf));

    // The writer closed the panel: nobody will see these rewrites, so nothing
    // is billed (the inline rewrite's rule, D-142).
    if (req.signal.aborted) return new Response(null, { status: 499 });

    const ms = Date.now() - startedAt;
    const timing = { "Server-Timing": `llm;dur=${ms}` };
    const versions = halves.flatMap((half) => (half.version ? [half.version] : []));
    const failed = halves.flatMap((half) => (half.failure ? [half.failure] : []));

    if (versions.length === 0) {
      return NextResponse.json(
        { error: "No usable rewrite came back. Please try again.", retryable: true, failed },
        { status: 502, headers: timing }
      );
    }

    // Only the halves that produced prose are billed.
    const tokensUsed = halves.reduce(
      (sum, half) => ({ input: sum.input + half.tokens.input, output: sum.output + half.tokens.output }),
      { input: 0, output: 0 }
    );
    await db.usageRecord.create({
      data: {
        userId: user.id,
        bookId,
        agentType: "polish-scene",
        model: model.id,
        tokensInput: tokensUsed.input,
        tokensOutput: tokensUsed.output,
        costEstimate: estimateCost(model.id, tokensUsed.input, tokensUsed.output),
      },
    });
    if (quotaResult.isFree) {
      await recordDailyUse(user.id, "inline");
    }

    return NextResponse.json(
      { versions, failed, tokensUsed, elapsedMs: ms },
      { headers: timing }
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if (req.signal.aborted || (error as Error).name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("POST /api/books/:id/polish-scene error:", (error as Error).message);
    return NextResponse.json({ error: "Failed to polish the scene" }, { status: 500 });
  }
}
