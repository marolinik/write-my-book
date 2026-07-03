import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { sendMessageSchema } from "@/lib/validation";
import {
  createLLMClient,
  resolveModelForRole,
  mapAgentTypeToRole,
  resolveProviderRoute,
} from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import {
  getSession,
  createSession,
  pushMessage,
  completeSession,
  getWorkflow,
  AgentOrchestrator,
  loadConversationHistory,
  addUserMessage,
  addAssistantMessage,
} from "@/lib/agents";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents";

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

/** POST /api/books/:id/agent/:sessionId/message — send a message to a conversational session. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;
    const body = await req.json();
    const { message, pageContext } = sendMessageSchema.parse(body);

    let session = getSession(sessionId);

    // If in-memory session is missing (server restarted), reconstruct from DB
    if (!session) {
      const dbSession = await db.agentSession.findFirst({
        where: { id: sessionId, bookId, userId: user.id },
      });

      if (!dbSession || !dbSession.workflowId) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      // Reconstruct in-memory session
      session = createSession(
        sessionId,
        bookId,
        user.id,
        dbSession.agentType,
        dbSession.workflowId
      );
      session.status = "completed"; // Will be set to running below

      // Load conversation history from DB
      const history = await loadConversationHistory(sessionId);
      session.conversationHistory = history;
    }

    if (session.bookId !== bookId || session.userId !== user.id) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "running" && session.status !== "completed") {
      return NextResponse.json(
        { error: "Session is not active" },
        { status: 400 }
      );
    }

    const workflow = getWorkflow(session.workflowId);
    if (!workflow?.conversational) {
      return NextResponse.json(
        { error: "This workflow does not support conversation" },
        { status: 400 }
      );
    }

    // Push user message to stream so it appears in the UI
    pushMessage(sessionId, {
      type: "text",
      content: message,
      metadata: { role: "user" },
    });

    // Reset status if continuing after completion
    session.status = "running";

    // ── Model Resolution (BYOK — no platform key fallbacks) ─────
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { settings: true },
    });

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
      book?.settings ?? null,
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

    // Create orchestrator and continue conversation
    const orchestrator = new AgentOrchestrator({
      client,
      modelId: model.modelId,
      registryId: model.id,
    });
    session.orchestrator = orchestrator;

    // Restore full context from the original session (not hardcoded)
    const dbSessionRecord = await db.agentSession.findFirst({
      where: { id: sessionId, bookId, userId: user.id },
      select: { chapterNumber: true, workflowId: true },
    });
    const originalWorkflow = getWorkflow(session.workflowId);

    const spawnOptions = {
      agentType: workflow.primaryAgent,
      model: model.tier,
      context: {
        bookId,
        bookName: book?.name,
        userId: user.id,
        chapterNumber: dbSessionRecord?.chapterNumber ?? undefined,
        language: book?.language,
        targetWorkflowId: session.workflowId,
        targetAgentType: originalWorkflow?.primaryAgent,
        pageContext,
      },
      workflowId: session.workflowId,
      sessionId,
      onMessage: (msg: AgentStreamMessage) => {
        pushMessage(sessionId, msg);
      },
      onComplete: async (result: AgentResult) => {
        completeSession(sessionId, result);

        // Persist the assistant's reply so a continued session survives a
        // server restart with full context (fire-safe — never throws).
        if (!result.cancelled && result.assistantText) {
          await addAssistantMessage(sessionId, result.assistantText);
        }

        await db.agentSession.update({
          where: { id: sessionId },
          data: {
            tokensInput: { increment: result.tokensInput },
            tokensOutput: { increment: result.tokensOutput },
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
            bookId,
            agentType: workflow.primaryAgent,
            model: model.id,
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            costEstimate: cost,
          },
        });
      },
      onError: async (error: Error) => {
        pushMessage(sessionId, { type: "error", content: error.message });
        completeSession(sessionId, {
          success: false,
          tokensInput: 0,
          tokensOutput: 0,
          documentIds: [],
          sessionId,
        });
      },
    } as const;

    // Persist the incoming user turn AFTER any DB rehydration above (so it is
    // not double-counted into the loaded history) and BEFORE the orchestrator
    // appends it in-memory — fire-safe, never throws.
    await addUserMessage(sessionId, message);

    // Fire and forget
    orchestrator
      .continueConversation(
        spawnOptions,
        session.conversationHistory,
        message
      )
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
    console.error(
      "POST /api/books/:id/agent/:sessionId/message error:",
      (error as Error).message
    );
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
