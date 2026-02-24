import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota, getSessionCostLimit } from "@/lib/billing/quota-checker";
import { createLLMClient, getModelDef, resolveFromTier } from "@/lib/llm";
import { z } from "zod";
import { pageContextSchema } from "@/lib/validation";
import {
  AgentOrchestrator,
  getWorkflow,
  getAgentDefinition,
  createSession,
  pushMessage,
  completeSession,
  validatePrerequisites,
} from "@/lib/agents";
import type {
  AgentStreamMessage,
  AgentResult,
  AgentType,
  SharedCostTracker,
  DelegationContext,
} from "@/lib/agents";
import { processPostSession } from "@/lib/agents";

type RouteParams = { params: Promise<{ id: string }> };

const startSessionSchema = z.object({
  workflowId: z.string().min(1),
  chapterNumber: z.number().int().min(1).max(999).optional(),
  message: z.string().max(10000).optional(),
  pageContext: pageContextSchema,
});

/** POST /api/books/:id/agent — start a new agent session. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await req.json();
    const data = startSessionSchema.parse(body);

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { settings: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Resolve workflow
    const workflow = getWorkflow(data.workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: "Unknown workflow" },
        { status: 400 }
      );
    }

    // Always spawn the Writing Coach as the user-facing agent
    const coachDef = getAgentDefinition("writing-coach");
    if (!coachDef) {
      return NextResponse.json(
        { error: "Writing Coach agent not found" },
        { status: 500 }
      );
    }
    // Keep reference to the original workflow's primary agent for context
    const agentDef = coachDef;

    // Validate workflow prerequisites
    const prereqResult = await validatePrerequisites(
      data.workflowId,
      bookId,
      data.chapterNumber
    );
    if (!prereqResult.satisfied) {
      return NextResponse.json(
        {
          error: "Prerequisites not met",
          missing: prereqResult.missing,
        },
        { status: 422 }
      );
    }

    // ── Setup Completeness Guard (SETUP-07) ──────────────────
    // Non-setup workflows require setup to be complete.
    // Setup-category workflows are exempt so writers can complete onboarding.
    // Check both the wizard flag AND real foundational documents, because
    // books set up via agent sessions may not have the wizard flag set.
    if (workflow.category !== "setup") {
      const wizardComplete = book.settings?.setupComplete ?? false;
      if (!wizardComplete) {
        const docTypes = await db.document.findMany({
          where: { bookId, type: { in: ["FINGERPRINT", "STORY_BIBLE", "ARCHITECTURE"] } },
          select: { type: true },
        });
        const chapterCount = await db.chapter.count({ where: { bookId } });
        const hasFingerprint = docTypes.some((d) => d.type === "FINGERPRINT");
        const hasBible = docTypes.some((d) => d.type === "STORY_BIBLE");
        const hasArch = docTypes.some((d) => d.type === "ARCHITECTURE");
        const allRealStepsDone = hasFingerprint && hasBible && hasArch && chapterCount > 0;

        if (!allRealStepsDone) {
          return NextResponse.json(
            {
              error: "Setup incomplete",
              setupIncomplete: true,
              redirectTo: `/books/${bookId}/setup`,
            },
            { status: 422 }
          );
        }
      }
    }

    // Check monthly usage quota
    const quotaResult = await checkQuota(user.id, "use_agent_session");
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: quotaResult.reason },
        { status: 429 }
      );
    }

    // Get per-session cost limit based on plan
    const sessionCostLimit = await getSessionCostLimit(user.id);

    // ── Model Resolution ──────────────────────────────────────────
    // The Coach always runs on Opus. Specialists get their models resolved
    // at delegation time via the createSpecialistClient factory.
    const settings = book.settings;

    // Load user's default model for provider preference
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { defaultModel: true },
    });
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
    const userProvider = userDefault.startsWith("openrouter/") ? "openrouter" : "anthropic";

    // Coach always uses Opus
    const registryId = `${userProvider}/opus`;
    const modelDef = getModelDef(registryId) ?? resolveFromTier(registryId);

    // ── API Key Resolution ──────────────────────────────────────
    let anthropicApiKey: string | undefined;
    let openrouterApiKey: string | undefined;

    if (modelDef.provider === "openrouter") {
      const orKey = await db.apiKey.findFirst({
        where: { userId: user.id, provider: "openrouter", isDefault: true },
      });
      if (orKey) {
        openrouterApiKey = decryptApiKey(orKey.encryptedKey);
      } else if (process.env.OPENROUTER_API_KEY) {
        openrouterApiKey = process.env.OPENROUTER_API_KEY;
      }

      if (!openrouterApiKey) {
        return NextResponse.json(
          { error: "No OpenRouter API key configured. Add one in Settings." },
          { status: 400 }
        );
      }
    } else {
      const antKey = await db.apiKey.findFirst({
        where: { userId: user.id, provider: "anthropic", isDefault: true },
      });
      if (antKey) {
        anthropicApiKey = decryptApiKey(antKey.encryptedKey);
      } else if (process.env.ANTHROPIC_API_KEY) {
        anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      }

      if (!anthropicApiKey) {
        return NextResponse.json(
          { error: "No Anthropic API key configured. Add one in Settings." },
          { status: 400 }
        );
      }
    }

    // ── Build Coach LLM Client ──────────────────────────────────
    const { client, model } = createLLMClient({
      modelId: registryId,
      anthropicApiKey,
      openrouterApiKey,
    });

    // ── Specialist Client Factory ─────────────────────────────
    // The Coach delegates to specialists at runtime. This factory
    // resolves the specialist's model tier and creates an LLM client
    // using the same provider preference and API keys.
    const createSpecialistClient = async (agentType: AgentType) => {
      const specialistDef = getAgentDefinition(agentType);
      if (!specialistDef) throw new Error(`Unknown specialist: ${agentType}`);
      const specialistRegistryId = `${userProvider}/${specialistDef.defaultModel}`;
      const specialistModel = getModelDef(specialistRegistryId) ?? resolveFromTier(specialistRegistryId);
      const { client: specialistClient } = createLLMClient({
        modelId: specialistRegistryId,
        anthropicApiKey,
        openrouterApiKey,
      });
      return {
        client: specialistClient,
        modelId: specialistModel.modelId,
        registryId: specialistModel.id,
      };
    };

    // Create DB session record — always writing-coach as the user-facing agent
    const dbSession = await db.agentSession.create({
      data: {
        bookId,
        userId: user.id,
        agentType: "writing-coach",
        workflowId: data.workflowId,
        chapterNumber: data.chapterNumber ?? null,
        status: "running",
      },
    });

    // Create in-memory session
    const session = createSession(
      dbSession.id,
      bookId,
      user.id,
      "writing-coach",
      data.workflowId
    );

    // ── Shared Cost Tracker ───────────────────────────────────
    const sharedCostTracker: SharedCostTracker = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    // ── Delegation Context ────────────────────────────────────
    const onMessage = (message: AgentStreamMessage) => {
      pushMessage(dbSession.id, message);
    };

    const delegationContext: DelegationContext = {
      parentSessionId: dbSession.id,
      parentOnMessage: onMessage,
      sharedCostTracker,
      language: book.language ?? "en",
      chapterNumber: data.chapterNumber,
      createSpecialistClient,
    };

    // Spawn orchestrator (fire and forget)
    const orchestrator = new AgentOrchestrator({
      client,
      modelId: model.modelId,
      registryId: model.id,
      maxSessionCostUsd: sessionCostLimit,
      sharedCostTracker,
      delegationContext,
    });
    session.orchestrator = orchestrator;

    const spawnOptions = {
      agentType: "writing-coach" as const,
      model: model.tier,
      context: {
        bookId,
        bookName: book.name,
        userId: user.id,
        chapterNumber: data.chapterNumber,
        language: book.language,
        targetWorkflowId: data.workflowId,
        targetAgentType: workflow.primaryAgent,
        userMessage: data.message,
        pageContext: data.pageContext,
      },
      workflowId: data.workflowId,
      sessionId: dbSession.id,
      onMessage,
      onComplete: async (result: AgentResult) => {
        // Run post-session processing (parse reports, store findings, advance status)
        let suggestedNext: string[] = [];
        let resultMeta: {
          findingsCreated: number;
          statusAdvanced: boolean;
          newStatus?: string;
          betaGateResult?: string;
        } = { findingsCreated: 0, statusAdvanced: false };
        try {
          const postResult = await processPostSession({
            sessionId: dbSession.id,
            bookId,
            userId: user.id,
            workflowId: data.workflowId,
            agentType: workflow.primaryAgent,
            chapterNumber: data.chapterNumber,
          });
          suggestedNext = postResult.suggestedNext;
          resultMeta = {
            findingsCreated: postResult.findingsCreated,
            statusAdvanced: postResult.statusAdvanced,
            newStatus: postResult.newStatus,
            betaGateResult: postResult.betaGateResult,
          };
        } catch (e) {
          console.error("[PostSession] Error:", e);
        }

        // Attach result metadata to the AgentResult for SSE propagation
        const enrichedResult = { ...result, resultMeta };
        completeSession(dbSession.id, enrichedResult, suggestedNext);

        // Update DB records — include shared cost tracker totals
        const totalInput = sharedCostTracker.totalInputTokens;
        const totalOutput = sharedCostTracker.totalOutputTokens;
        await db.agentSession.update({
          where: { id: dbSession.id },
          data: {
            status: result.success ? "completed" : "failed",
            tokensInput: totalInput,
            tokensOutput: totalOutput,
            completedAt: new Date(),
          },
        });

        // Create usage record with total tokens (Coach + all specialists)
        const cost = estimateCost(model.id, totalInput, totalOutput);
        await db.usageRecord.create({
          data: {
            userId: user.id,
            bookId,
            agentType: "writing-coach",
            model: model.id,
            tokensInput: totalInput,
            tokensOutput: totalOutput,
            costEstimate: cost,
          },
        });
      },
      onError: async (error: Error) => {
        onMessage({
          type: "error",
          content: error.message,
        });
        completeSession(dbSession.id, {
          success: false,
          tokensInput: 0,
          tokensOutput: 0,
          documentIds: [],
          sessionId: dbSession.id,
        });

        await db.agentSession.update({
          where: { id: dbSession.id },
          data: {
            status: "failed",
            completedAt: new Date(),
          },
        });
      },
    } as const;

    // Fire and forget — don't await
    orchestrator.runAgent(spawnOptions).catch(() => {});

    return NextResponse.json({ sessionId: dbSession.id });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error("POST /api/books/:id/agent error:", error);
    return NextResponse.json(
      { error: "Failed to start agent session" },
      { status: 500 }
    );
  }
}
