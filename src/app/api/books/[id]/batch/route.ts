import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { checkQuota } from "@/lib/billing/quota-checker";
import { estimateWorkflowCost, type ProviderKey } from "@/lib/llm";
import { getWorkflow } from "@/lib/agents/workflows";
import { enqueueBatchFlow, type BatchChildPayload } from "@/lib/queue/batch-flow";
import { findIneligibleWorkflows } from "@/lib/batch/eligibility";
import {
  resolveBatchModels,
  type AvailableKeys,
} from "@/lib/batch/resolve-batch-models";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** Safety multiplier applied to the per-child pre-session max cost estimate. */
const BUDGET_SAFETY_FACTOR = 2;
/** Lower bound for a per-child session budget (mirror agent/route.ts). */
const MIN_SESSION_BUDGET_USD = 5;
/** Default aggregate batch cap (owner decision, BATCH-SPEC §9.1). Editable. */
const DEFAULT_BATCH_CAP_USD = 10;
/** Hard maximum aggregate batch cap (owner decision, BATCH-SPEC §9.1). */
const MAX_BATCH_CAP_USD = 25;

const createBatchSchema = z.object({
  workflowIds: z.array(z.string().min(1)).min(1).max(4),
  chapterStart: z.number().int().min(1).max(9999).optional(),
  chapterEnd: z.number().int().min(1).max(9999).optional(),
  budgetCapUsd: z.number().optional(),
  scheduleMode: z.enum(["now", "tonight"]).default("now"),
  /** Absolute instant for a scheduled batch (client computes it in the user's tz). */
  scheduledFor: z.string().datetime().optional(),
});

/** Next occurrence of 02:00 UTC strictly after `now` (server-side fallback). */
function nextTwoAmUtc(now: Date): Date {
  const candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      2,
      0,
      0,
      0
    )
  );
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

/**
 * POST /api/books/:id/batch — create/schedule a batch of NON-prose-mutating
 * editorial passes over a chapter range (BATCH-SPEC §7). Fans out
 * (workflows × chapters) into background children via `enqueueBatchFlow`.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
    const data = createBatchSchema.parse(body);

    // ── Ownership fence (userId) ────────────────────────────────────────
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { settings: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // ── Batch-eligibility (the load-bearing v1 guardrail, §7.2) ─────────
    // Reject any prose-mutating / conversational workflow BEFORE doing work.
    const ineligible = findIneligibleWorkflows(data.workflowIds);
    if (ineligible.length > 0) {
      return NextResponse.json(
        {
          error: `These workflows can't run in an unattended batch: ${ineligible.join(", ")}. v1 batches allow only non-mutating editorial passes (dev-edit, line-edit, beta-read, analyze).`,
        },
        { status: 400 }
      );
    }

    // ── Finite budget-cap validation ($0 < cap ≤ $25) ───────────────────
    const budgetCapUsd = data.budgetCapUsd ?? DEFAULT_BATCH_CAP_USD;
    if (
      !Number.isFinite(budgetCapUsd) ||
      budgetCapUsd <= 0 ||
      budgetCapUsd > MAX_BATCH_CAP_USD
    ) {
      return NextResponse.json(
        {
          error: `Budget cap must be a finite dollar amount between $0 and $${MAX_BATCH_CAP_USD}.`,
        },
        { status: 400 }
      );
    }

    // ── Monthly usage quota (same gate as the single-session route) ─────
    const quotaResult = await checkQuota(user.id, "use_agent_session");
    if (!quotaResult.allowed) {
      return NextResponse.json({ error: quotaResult.reason }, { status: 429 });
    }

    // ── Resolve the workflows (all known + eligible at this point) ──────
    const workflows = data.workflowIds.map((id) => getWorkflow(id)!);

    // ── Resolve the chapter set for chapter-scoped passes ───────────────
    const needsChapters = workflows.some((w) => w.requiresChapter);
    let chapterNumbers: number[] = [];
    let rangeStart = 0;
    let rangeEnd = 0;
    if (needsChapters) {
      const hasExplicitRange =
        data.chapterStart != null || data.chapterEnd != null;
      const chapters = await db.chapter.findMany({
        where: {
          bookId,
          ...(hasExplicitRange
            ? {
                chapterNumber: {
                  gte: data.chapterStart ?? 1,
                  lte: data.chapterEnd ?? 9999,
                },
              }
            : {}),
        },
        select: { chapterNumber: true },
        orderBy: { chapterNumber: "asc" },
      });
      chapterNumbers = chapters.map((c) => c.chapterNumber);
      if (chapterNumbers.length === 0) {
        return NextResponse.json(
          { error: "No chapters in the selected range to process." },
          { status: 400 }
        );
      }
      rangeStart = chapterNumbers[0];
      rangeEnd = chapterNumbers[chapterNumbers.length - 1];
    }

    // ── Load model preferences + validated API keys, resolve coach ──────
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        defaultModel: true,
        modelGhostwriter: true,
        modelEditor: true,
        modelBetaReader: true,
        modelAnalyst: true,
        modelCoach: true,
        modelCreative: true,
      },
    });

    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id },
      select: { provider: true, encryptedKey: true, validatedAt: true },
    });
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      if (k.validatedAt) {
        try {
          decryptedKeys[k.provider as ProviderKey] = decryptApiKey(
            k.encryptedKey
          );
        } catch {
          // Skip keys that fail to decrypt
        }
      }
    }
    const availableKeys: AvailableKeys = {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    };

    const settings = book.settings;
    const resolved = resolveBatchModels({
      workflowIds: data.workflowIds,
      bookSettings: settings
        ? {
            modelGhostwriter: settings.modelGhostwriter,
            modelEditor: settings.modelEditor,
            modelBetaReader: settings.modelBetaReader,
            modelAnalyst: settings.modelAnalyst,
            modelCoach: settings.modelCoach,
            modelCreative: settings.modelCreative,
            modelOverride: settings.modelOverride,
          }
        : null,
      userDefaults: {
        defaultModel: dbUser?.defaultModel ?? null,
        modelGhostwriter: dbUser?.modelGhostwriter ?? null,
        modelEditor: dbUser?.modelEditor ?? null,
        modelBetaReader: dbUser?.modelBetaReader ?? null,
        modelAnalyst: dbUser?.modelAnalyst ?? null,
        modelCoach: dbUser?.modelCoach ?? null,
        modelCreative: dbUser?.modelCreative ?? null,
      },
      availableKeys,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.code }
      );
    }
    const { coachRegistryId, coachModelId, providerKey } = resolved;

    // ── Expand (workflows × chapters) into child payloads ───────────────
    const children: BatchChildPayload[] = [];
    for (const workflow of workflows) {
      const preEstimate = estimateWorkflowCost(workflow.id, coachRegistryId);
      const sessionCostLimit = Math.max(
        preEstimate.max * BUDGET_SAFETY_FACTOR,
        MIN_SESSION_BUDGET_USD
      );
      const estimatedMaxMin = workflow.estimatedMaxMinutes ?? 30;
      const serverCeilingMs = (estimatedMaxMin + 30) * 60 * 1000;
      const base = {
        bookId,
        userId: user.id,
        workflowId: workflow.id,
        agentType: workflow.primaryAgent,
        coachRegistryId,
        coachModelId,
        providerKey,
        language: book.language ?? "en",
        bookName: book.name,
        sessionCostLimit,
        serverCeilingMs,
        isConversational: false,
      };
      if (workflow.requiresChapter) {
        for (const chapterNumber of chapterNumbers) {
          children.push({ ...base, chapterNumber });
        }
      } else {
        children.push({ ...base, chapterNumber: undefined });
      }
    }

    if (children.length === 0) {
      return NextResponse.json(
        { error: "Nothing to run for the selected passes." },
        { status: 400 }
      );
    }

    // ── Scheduling: 'now' => immediate; 'tonight' => next 2am ───────────
    let scheduledFor: Date | null = null;
    if (data.scheduleMode === "tonight") {
      const now = new Date();
      const requested = data.scheduledFor ? new Date(data.scheduledFor) : null;
      scheduledFor =
        requested && requested.getTime() > now.getTime()
          ? requested
          : nextTwoAmUtc(now);
    }

    const result = await enqueueBatchFlow({
      userId: user.id,
      bookId,
      workflowIds: data.workflowIds,
      chapterStart: rangeStart,
      chapterEnd: rangeEnd,
      budgetCapUsd,
      scheduledFor,
      children,
    });

    return NextResponse.json(
      {
        batchId: result.batchId,
        childCount: result.childCount,
        scheduledFor: result.scheduledFor,
      },
      { status: 201 }
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(
      "POST /api/books/:id/batch error:",
      (error as Error).message ?? "Unknown error"
    );
    return NextResponse.json(
      { error: "Failed to create batch" },
      { status: 500 }
    );
  }
}

/** GET /api/books/:id/batch — list recent batches for this book. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const batches = await db.batchRun.findMany({
      where: { bookId, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        workflowIds: true,
        chapterStart: true,
        chapterEnd: true,
        budgetCapUsd: true,
        spentUsd: true,
        halted: true,
        haltReason: true,
        scheduledFor: true,
        childCount: true,
        completedCount: true,
        failedCount: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ batches });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "GET /api/books/:id/batch error:",
      (error as Error).message ?? "Unknown error"
    );
    return NextResponse.json(
      { error: "Failed to list batches" },
      { status: 500 }
    );
  }
}
