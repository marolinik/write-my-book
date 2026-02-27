import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { startSeriesAgentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { createLLMClient, getModelDef, resolveFromTier } from "@/lib/llm";
import {
  AgentOrchestrator,
  getWorkflow,
  getAgentDefinition,
  createSession,
  pushMessage,
  completeSession,
  processPostSession,
} from "@/lib/agents";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/series/:id/agent — start a series-aware agent session. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const body = await req.json();
    const data = startSeriesAgentSchema.parse(body);

    // Verify series ownership
    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Verify book belongs to series
    const book = await db.book.findFirst({
      where: { id: data.bookId, seriesId, userId: user.id },
      include: { settings: true },
    });
    if (!book) {
      return NextResponse.json(
        { error: "Book not found in this series" },
        { status: 404 }
      );
    }

    // Resolve workflow
    const workflow = getWorkflow(data.workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: "Unknown workflow" },
        { status: 400 }
      );
    }

    // Get the agent definition
    const agentDef = getAgentDefinition(workflow.primaryAgent);
    if (!agentDef) {
      return NextResponse.json(
        { error: "Unknown agent type" },
        { status: 400 }
      );
    }

    // ── Model Resolution ──────────────────────────────────────────
    const settings = book.settings;
    const agentType = workflow.primaryAgent;
    let resolvedTier: string | null = null;

    if (settings) {
      if (agentType === "ghostwriter" && settings.modelGhostwriter) {
        resolvedTier = settings.modelGhostwriter;
      } else if (
        ["dev-editor", "line-editor", "continuity-checker"].includes(agentType) &&
        settings.modelEditor
      ) {
        resolvedTier = settings.modelEditor;
      } else if (agentType === "beta-reader" && settings.modelBetaReader) {
        resolvedTier = settings.modelBetaReader;
      } else if (agentType === "manuscript-analyst" && settings.modelAnalyst) {
        resolvedTier = settings.modelAnalyst;
      } else if (agentType === "writing-coach" && settings.modelCoach) {
        resolvedTier = settings.modelCoach;
      } else if (
        ["style-analyst", "story-architect", "scene-planner"].includes(agentType) &&
        settings.modelCreative
      ) {
        resolvedTier = settings.modelCreative;
      } else if (
        ["manuscript-reader", "world-researcher", "market-reader", "publishing-editor"].includes(agentType) &&
        settings.modelResearch
      ) {
        resolvedTier = settings.modelResearch;
      }
    }

    // Load user's default model
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { defaultModel: true },
    });
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
    const userProvider = userDefault.startsWith("openrouter/") ? "openrouter" : "anthropic";

    let registryId: string;
    if (settings?.modelOverride) {
      registryId = settings.modelOverride;
    } else if (resolvedTier) {
      registryId = `${userProvider}/${resolvedTier}`;
    } else {
      registryId = `${userProvider}/${agentDef.defaultModel}`;
    }

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

    const { client, model } = createLLMClient({
      modelId: registryId,
      anthropicApiKey,
      openrouterApiKey,
    });

    // Pre-load series documents
    const seriesDocService = new DocumentService(
      user.id,
      undefined,
      seriesId
    );
    let seriesBible = "";
    let seriesArchitecture = "";

    const bibleDoc = await seriesDocService.findByType(
      DocumentType.SERIES_BIBLE
    );
    if (bibleDoc) {
      const content = await seriesDocService.read(bibleDoc.id);
      seriesBible = content?.content ?? "";
    }

    const archDoc = await seriesDocService.findByType(
      DocumentType.SERIES_ARCHITECTURE
    );
    if (archDoc) {
      const content = await seriesDocService.read(archDoc.id);
      seriesArchitecture = content?.content ?? "";
    }

    // Create DB session record
    const dbSession = await db.agentSession.create({
      data: {
        bookId: data.bookId,
        userId: user.id,
        agentType: workflow.primaryAgent,
        status: "running",
      },
    });

    // Create in-memory session
    const session = createSession(
      dbSession.id,
      data.bookId,
      user.id,
      workflow.primaryAgent,
      data.workflowId
    );

    // ── Workflow-specific timeout ceiling ────────────────────────
    const estimatedMaxMin = workflow.estimatedMaxMinutes ?? 30;
    const serverCeilingMs = (estimatedMaxMin + 30) * 60 * 1000;

    // Spawn orchestrator
    const orchestrator = new AgentOrchestrator({
      client,
      modelId: model.modelId,
      registryId: model.id,
      maxRuntimeMs: serverCeilingMs,
    });
    session.orchestrator = orchestrator;

    const spawnOptions = {
      agentType: workflow.primaryAgent,
      model: model.tier,
      context: {
        bookId: data.bookId,
        bookName: book.name,
        userId: user.id,
        chapterNumber: data.chapterNumber,
        language: book.language,
        seriesId,
        seriesBible,
        seriesArchitecture,
      },
      workflowId: data.workflowId,
      sessionId: dbSession.id,
      onMessage: (message: AgentStreamMessage) => {
        pushMessage(dbSession.id, message);
      },
      onComplete: async (result: AgentResult) => {
        let suggestedNext: string[] = [];
        try {
          const postResult = await processPostSession({
            sessionId: dbSession.id,
            bookId: data.bookId,
            userId: user.id,
            workflowId: data.workflowId,
            agentType: workflow.primaryAgent,
            chapterNumber: data.chapterNumber,
          });
          suggestedNext = postResult.suggestedNext;
        } catch (e) {
          console.error("[PostSession] Error:", e);
        }

        completeSession(dbSession.id, result);

        await db.agentSession.update({
          where: { id: dbSession.id },
          data: {
            status: result.success ? "completed" : "failed",
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            completedAt: new Date(),
          },
        });

        const cost = estimateCost(
          model.id,
          result.tokensInput,
          result.tokensOutput
        );
        await db.usageRecord.create({
          data: {
            userId: user.id,
            bookId: data.bookId,
            agentType: workflow.primaryAgent,
            model: model.id,
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            costEstimate: cost,
          },
        });
      },
      onError: async (error: Error) => {
        pushMessage(dbSession.id, {
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

    // Fire and forget
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
    console.error("POST /api/series/:id/agent error:", error);
    return NextResponse.json(
      { error: "Failed to start series agent session" },
      { status: 500 }
    );
  }
}
