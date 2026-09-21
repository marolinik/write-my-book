import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  resolveModelForRole,
  meetsMinimumTier,
  mapAgentTypeToRole,
  type BookModelSettings,
  type AgentRole,
} from "@/lib/llm";
import { estimateWorkflowCost, estimateEmbeddingCost, formatCostRange } from "@/lib/llm/cost-estimator";
import { calibrateEstimate } from "@/lib/llm/cost-calibration";

/** How many past runs of the same agent the calibration reads. */
const CALIBRATION_SAMPLE = 12;

import { getWorkflow } from "@/lib/agents/workflows";
import { globalOverridesOf, userModelSettingsOf, bookModelSettingsOf } from "@/lib/llm/model-resolver";
import { BILLED_ONLY } from "@/lib/billing/billed-usage";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/books/:id/cost-estimate?workflowId=X
 *
 * Returns a pre-session cost estimate for a workflow using the resolved model.
 * Combines the 4-level resolution chain, minimum tier check, and cost estimation.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    // Parse query parameter
    const { searchParams } = req.nextUrl;
    const workflowId = searchParams.get("workflowId");

    if (!workflowId) {
      return NextResponse.json(
        { error: "workflowId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { settings: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Get workflow definition
    const workflow = getWorkflow(workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: `Unknown workflow: ${workflowId}` },
        { status: 400 }
      );
    }

    // Map primary agent to role
    const role = mapAgentTypeToRole(workflow.primaryAgent);

    // Build book model settings (if BookSettings exists)
    const bookSettings: BookModelSettings | null = book.settings
      ? bookModelSettingsOf(book.settings)
      : null;

    // Build global role overrides from User model
    const globalRoleOverrides: Record<AgentRole, string | null> = globalOverridesOf(userModelSettingsOf(user));

    // Resolve model via 4-level chain
    const resolvedModel = resolveModelForRole(
      role,
      bookSettings,
      globalRoleOverrides,
      user.defaultModel
    );

    // Check minimum tier enforcement
    if (workflow.minimumTier) {
      if (!meetsMinimumTier(resolvedModel.registryId, workflow.minimumTier)) {
        return NextResponse.json({
          blocked: true,
          reason: `This workflow requires at least a ${workflow.minimumTier}-class model. Your current model (${resolvedModel.modelDef.displayName}) is ${resolvedModel.modelDef.tier}-class.`,
          currentModel: {
            registryId: resolvedModel.registryId,
            displayName: resolvedModel.modelDef.displayName,
            tier: resolvedModel.modelDef.tier,
            resolvedFrom: resolvedModel.resolvedFrom,
          },
          minimumTier: workflow.minimumTier,
        });
      }
    }

    // Estimate cost
    const costEstimate = estimateWorkflowCost(
      workflowId,
      resolvedModel.registryId
    );

    // Estimate embedding cost (for workflows that trigger vector indexing)
    const embeddingEstimate = estimateEmbeddingCost(workflowId);

    // D2: the heuristic drifts 30-38% on real batches, and the writer reads
    // this number before agreeing to spend money. Every paid run of this
    // agent on this book left a UsageRecord; once there are enough of them,
    // the book's own spread replaces the table and the product says how many
    // runs it is speaking from.
    const pastRuns = await db.usageRecord.findMany({
      where: {
        bookId,
        agentType: workflow.primaryAgent,
        costEstimate: { gt: 0 },
        ...BILLED_ONLY,
      },
      orderBy: { recordedAt: "desc" },
      take: CALIBRATION_SAMPLE,
      select: { costEstimate: true },
    });
    const calibrated = calibrateEstimate(
      pastRuns.map((run) => run.costEstimate),
      costEstimate
    );

    return NextResponse.json({
      blocked: false,
      costEstimate: calibrated
        ? {
            min: calibrated.min,
            max: calibrated.max,
            formatted: formatCostRange(calibrated.min, calibrated.max),
            basedOnRuns: calibrated.basedOn,
          }
        : {
            min: costEstimate.min,
            max: costEstimate.max,
            formatted: costEstimate.formatted,
            basedOnRuns: null,
          },
      embeddingEstimate: embeddingEstimate
        ? {
            min: embeddingEstimate.min,
            max: embeddingEstimate.max,
            formatted: `~$${embeddingEstimate.max.toFixed(4)}`,
          }
        : null,
      resolvedModel: {
        registryId: resolvedModel.registryId,
        displayName: resolvedModel.modelDef.displayName,
        tier: resolvedModel.modelDef.tier,
        resolvedFrom: resolvedModel.resolvedFrom,
      },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/cost-estimate error:", error);
    return NextResponse.json(
      { error: "Failed to estimate cost" },
      { status: 500 }
    );
  }
}
