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
import { estimateWorkflowCost, estimateEmbeddingCost } from "@/lib/llm/cost-estimator";
import { getWorkflow } from "@/lib/agents/workflows";

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
      ? {
          modelGhostwriter: book.settings.modelGhostwriter,
          modelEditor: book.settings.modelEditor,
          modelBetaReader: book.settings.modelBetaReader,
          modelAnalyst: book.settings.modelAnalyst,
          modelCoach: book.settings.modelCoach,
          modelCreative: book.settings.modelCreative,
          modelOverride: book.settings.modelOverride,
        }
      : null;

    // Build global role overrides from User model
    const globalRoleOverrides: Record<AgentRole, string | null> = {
      ghostwriter: user.modelGhostwriter,
      editor: user.modelEditor,
      "beta-reader": user.modelBetaReader,
      analyst: user.modelAnalyst,
      coach: user.modelCoach,
      creative: user.modelCreative,
    };

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

    return NextResponse.json({
      blocked: false,
      costEstimate: {
        min: costEstimate.min,
        max: costEstimate.max,
        formatted: costEstimate.formatted,
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
