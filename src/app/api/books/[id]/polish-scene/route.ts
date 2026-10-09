import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { enforceBookScript } from "@/lib/agents/serbian-script";
import { db } from "@/lib/db";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { readStoryBible, readVoiceFingerprint } from "@/lib/editorial/book-evidence";
import { resolveGhostwriterClient } from "@/lib/llm/ghostwriter-client";
import { withQuickAssistReasoning, extractQuickAssistText, isReasoningOnly } from "@/lib/llm/quick-assist";
import { clampMaxTokens } from "@/lib/llm/model-registry";
import {
  POLISH_INTENSITIES,
  buildPolishSystemPrompt,
  buildPolishUserContent,
  polishFitsBudget,
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
const NO_TOKENS = { input: 0, output: 0 };
const SCENE_TOO_LONG_CODE = "SCENE_TOO_LONG";
const MODEL_NO_POLISH_CODE = "MODEL_NO_POLISH";

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

    // A rewrite that cannot fit one reply would be cut off and refused every
    // time; say so before spending anything.
    if (!polishFitsBudget(data.selectedText)) {
      return NextResponse.json(
        { error: "The scene is too long to rewrite in one reply.", code: SCENE_TOO_LONG_CODE },
        { status: 400 }
      );
    }

    // Same plan check as the inline rewrite. On Free a polish draws on its own
    // daily meter: it sends the fingerprint and bible twice, far more than an
    // inline edit costs.
    const quotaResult = await checkQuota(user.id, "polish_scene");
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
    const ghost = await resolveGhostwriterClient(user.id, book);
    if (!ghost.ok) {
      return NextResponse.json(
        { error: "No API key configured for this model. Add one in Settings > API Keys." },
        { status: 400 }
      );
    }
    const { client, model, resolved, route } = ghost;

    const [fingerprint, storyBible] = await Promise.all([
      readVoiceFingerprint(bookId).catch(() => null),
      readStoryBible(bookId).catch(() => null),
    ]);

    const lang = book.language || "en";
    const userContent = buildPolishUserContent(data);
    // A model known to reason whatever it is told gets room to think before
    // it writes, within the model's own output ceiling.
    const maxTokens = clampMaxTokens(
      polishMaxTokens(data.selectedText, { reasoning: resolved.modelDef.unfitForQuickAssist === true }),
      resolved.modelDef
    );
    const startedAt = Date.now();

    const runHalf = async (intensity: PolishIntensity): Promise<HalfResult> => {
      const baseParams = {
        model: model.modelId,
        max_tokens: maxTokens,
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
        if (isReasoningOnly(response.content)) {
          return { intensity, failure: { intensity, reason: "reasoning-only" }, tokens: NO_TOKENS };
        }
        const settled = settlePolishedText(
          extractQuickAssistText(response.content),
          response.stop_reason,
          data.selectedText,
          lang
        );
        if (!settled.ok) {
          return { intensity, failure: { intensity, reason: settled.reason }, tokens: NO_TOKENS };
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
        return { intensity, failure: { intensity, reason: "error" }, tokens: NO_TOKENS };
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

    // A model that spent every reply thinking will do the same on a retry: say
    // so and point at the model, instead of an endless "try again" (D-100).
    if (versions.length === 0 && failed.every((f) => f.reason === "reasoning-only")) {
      return NextResponse.json(
        {
          error: "The ghostwriter's model returned only reasoning and no prose. Choose another model for the ghostwriter.",
          code: MODEL_NO_POLISH_CODE,
          failed,
        },
        { status: 422, headers: timing }
      );
    }

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
      await recordDailyUse(user.id, "polish");
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
