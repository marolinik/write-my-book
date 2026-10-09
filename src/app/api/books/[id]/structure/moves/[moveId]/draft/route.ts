import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { readStoryBible, readVoiceFingerprint } from "@/lib/editorial/book-evidence";
import { resolveGhostwriterClient } from "@/lib/llm/ghostwriter-client";
import { withQuickAssistReasoning, extractQuickAssistText, isReasoningOnly } from "@/lib/llm/quick-assist";
import { clampMaxTokens } from "@/lib/llm/model-registry";
import {
  discardRewriteDraft,
  draftRewriteMove,
  readCurrentChapterText,
  type GenerateRewrite,
} from "@/lib/structure/rewrite-move";
import type { MoveErrorCode } from "@/lib/structure/moves";

/**
 * /api/books/:id/structure/moves/:moveId/draft — dev editor v2, phase B.
 *
 * POST asks the book's ghostwriter for the draft of a pending trim/expand.
 * Nothing in the manuscript changes: the draft waits on the move until the
 * writer reads it and applies it (the decision route) or discards it (DELETE).
 * Billing follows Polish Scene: the plan check and the Free polish meter gate
 * it, tokens are billed whenever the model ran, the meter ticks only for a
 * usable draft.
 */

type RouteParams = { params: Promise<{ id: string; moveId: string }> };

/** A whole chapter can take a local model several minutes. */
const DRAFT_TIMEOUT_MS = 600_000;

const STATUS_BY_CODE: Partial<Record<MoveErrorCode, number>> = {
  move_not_found: 404,
  chapter_not_found: 409,
  not_pending: 409,
  unknown_kind: 400,
  content_missing: 409,
  chapter_too_long: 400,
  target_out_of_range: 409,
  instructions_required: 409,
  model_no_prose: 422,
  draft_rejected: 502,
};

async function ownedBook(userId: string, bookId: string) {
  return db.book.findFirst({
    where: { id: bookId, userId },
    select: { id: true, language: true, settings: true },
  });
}

function errorResponse(error: unknown, label: string) {
  if ((error as Error).message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: "Failed" }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, moveId } = await params;
    const book = await ownedBook(user.id, bookId);
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const quota = await checkQuota(user.id, "polish_scene");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: quota.reason, upgradeToTier: quota.upgradeToTier, remainingToday: quota.remainingToday },
        { status: 429 }
      );
    }

    const ghost = await resolveGhostwriterClient(user.id, book);
    if (!ghost.ok) {
      return NextResponse.json(
        { error: "No API key configured for this model. Add one in Settings > API Keys." },
        { status: 400 }
      );
    }
    const { client, model, resolved, route } = ghost;
    const reasoning = resolved.modelDef.unfitForQuickAssist === true;

    const [fingerprint, storyBible] = await Promise.all([
      readVoiceFingerprint(bookId).catch(() => null),
      readStoryBible(bookId).catch(() => null),
    ]);

    const generate: GenerateRewrite = async ({ system, user: content, maxTokens }) => {
      const base = {
        model: model.modelId,
        max_tokens: clampMaxTokens(maxTokens, resolved.modelDef),
        system,
        messages: [{ role: "user" as const, content }],
      };
      const response = await client.messages.create(
        route.route === "openrouter" || model.provider === "local" ? withQuickAssistReasoning(base) : base,
        { signal: req.signal, timeout: DRAFT_TIMEOUT_MS }
      );
      return {
        text: extractQuickAssistText(response.content),
        stopReason: response.stop_reason ?? null,
        reasoningOnly: isReasoningOnly(response.content),
        tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      };
    };

    let outcome;
    try {
      outcome = await draftRewriteMove(
        moveId,
        {
          bookId,
          userId: user.id,
          language: book.language || "en",
          fingerprint,
          storyBible,
          reasoning,
          modelId: resolved.registryId,
        },
        generate
      );
    } catch (error) {
      if (req.signal.aborted) return new Response(null, { status: 499 });
      console.error("structure draft: the model call failed:", (error as Error).message);
      return NextResponse.json({ error: "The ghostwriter did not answer. Please try again.", retryable: true }, { status: 502 });
    }

    // The model ran: its tokens are the writer's cost whether or not the
    // draft could be used.
    if (outcome.tokens) {
      await db.usageRecord.create({
        data: {
          userId: user.id,
          bookId,
          agentType: "structure-rewrite",
          model: resolved.registryId,
          tokensInput: outcome.tokens.input,
          tokensOutput: outcome.tokens.output,
          costEstimate: estimateCost(resolved.registryId, outcome.tokens.input, outcome.tokens.output),
        },
      });
    }

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error.message, code: outcome.error.code, retryable: outcome.error.code === "draft_rejected" },
        { status: STATUS_BY_CODE[outcome.error.code] ?? 409 }
      );
    }

    if (quota.isFree) await recordDailyUse(user.id, "polish");
    return NextResponse.json({ drafted: true, baseWords: outcome.baseWords, draftWords: outcome.draftWords });
  } catch (error) {
    return errorResponse(error, "POST /api/books/:id/structure/moves/:moveId/draft");
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, moveId } = await params;
    const book = await ownedBook(user.id, bookId);
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const move = await db.structureMove.findFirst({
      where: { id: moveId, bookId },
      select: { id: true, kind: true, status: true, draft: true, draftMeta: true, payload: true },
    });
    if (!move || move.status !== "drafted" || !move.draft) {
      return NextResponse.json({ error: "No draft" }, { status: 404 });
    }
    const payload = JSON.parse(move.payload) as { chapterId?: string; chapterNumber: number };
    const meta = move.draftMeta ? (JSON.parse(move.draftMeta) as { baseWords?: number; draftWords?: number }) : {};
    const before = await readCurrentChapterText({ bookId, userId: user.id }, payload);
    return NextResponse.json({
      before,
      after: move.draft,
      baseWords: meta.baseWords ?? null,
      draftWords: meta.draftWords ?? null,
    });
  } catch (error) {
    return errorResponse(error, "GET /api/books/:id/structure/moves/:moveId/draft");
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, moveId } = await params;
    const book = await ownedBook(user.id, bookId);
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const discarded = await discardRewriteDraft(moveId, bookId);
    if (!discarded) {
      return NextResponse.json({ error: "There is no draft to discard.", code: "not_drafted" }, { status: 409 });
    }
    return NextResponse.json({ discarded: true });
  } catch (error) {
    return errorResponse(error, "DELETE /api/books/:id/structure/moves/:moveId/draft");
  }
}
