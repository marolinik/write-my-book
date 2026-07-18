import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { startSeriesAgentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import {
  createLLMClient,
  resolveModelForRole,
  mapAgentTypeToRole,
  resolveProviderRoute,
} from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
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
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/series/:id/agent — start a series-aware agent session. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const body = await parseJsonBody(req);
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

    // Plan/quota gate — mirror the book-agent route. Without this an inactive
    // subscription could still start series agent sessions (a paid-feature
    // tier-gate bypass), unlike its book-agent counterpart.
    const quotaResult = await checkQuota(user.id, "use_agent_session");
    if (!quotaResult.allowed) {
      return NextResponse.json({ error: quotaResult.reason }, { status: 429 });
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

    // ── Model Resolution (BYOK — no platform key fallbacks) ─────
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
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";

    const role = mapAgentTypeToRole(workflow.primaryAgent);
    const resolved = resolveModelForRole(
      role,
      book.settings ?? null,
      {
        ghostwriter: dbUser?.modelGhostwriter ?? null,
        editor: dbUser?.modelEditor ?? null,
        "beta-reader": dbUser?.modelBetaReader ?? null,
        analyst: dbUser?.modelAnalyst ?? null,
        coach: dbUser?.modelCoach ?? null,
        creative: dbUser?.modelCreative ?? null,
      },
      userDefault
    );

    // ── API Key Resolution (all user keys, no platform fallbacks) ──
    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id, validatedAt: { not: null } },
      select: { provider: true, encryptedKey: true },
    });
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
    }

    const route = resolveProviderRoute(resolved.modelDef.provider, {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });
    if (route.route === "none") {
      return NextResponse.json(
        { error: route.error },
        { status: 400 }
      );
    }

    const { client, model } = createLLMClient({
      modelId: resolved.registryId,
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
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
        // Post-session is skipped for failed sessions (D-36: a
        // provider-failure run must not advance workflow state).
        let suggestedNext: string[] = [];
        if (result.success && !result.cancelled) {
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
            const errMsg = e instanceof Error ? e.message : "Unknown error";
            console.error("[PostSession] Error:", errMsg);
          }
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
          content: "An error occurred during the agent session",
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
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
    console.error("POST /api/series/:id/agent error:", (error as Error).message);
    return NextResponse.json(
      { error: "Failed to start series agent session" },
      { status: 500 }
    );
  }
}
