import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { sendMessageSchema } from "@/lib/validation";
import {
  getSession,
  pushMessage,
  completeSession,
  getWorkflow,
  AgentOrchestrator,
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
    const { message } = sendMessageSchema.parse(body);

    const session = getSession(sessionId);
    if (!session || session.bookId !== bookId || session.userId !== user.id) {
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

    // Get API key
    let apiKey: string | undefined;
    const userKey = await db.apiKey.findFirst({
      where: { userId: user.id, provider: "anthropic", isDefault: true },
    });
    if (userKey) {
      apiKey = decryptApiKey(userKey.encryptedKey);
    } else if (process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: "No API key configured" },
        { status: 400 }
      );
    }

    // Get model tier from book settings
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { settings: true },
    });

    const agentDef = await import("@/lib/agents/definitions").then((m) =>
      m.getAgentDefinition(workflow.primaryAgent)
    );
    let modelTier = agentDef?.defaultModel ?? "sonnet";
    if (book?.settings) {
      const agentType = workflow.primaryAgent;
      if (agentType === "writing-coach" && book.settings.modelEditor) {
        modelTier = book.settings.modelEditor as "opus" | "sonnet" | "haiku";
      }
    }

    // Create orchestrator and continue conversation
    const orchestrator = new AgentOrchestrator(apiKey);
    session.orchestrator = orchestrator;

    const spawnOptions = {
      agentType: workflow.primaryAgent,
      model: modelTier as "opus" | "sonnet" | "haiku",
      context: {
        bookId,
        userId: user.id,
        chapterNumber: undefined,
        language: book?.language,
      },
      workflowId: session.workflowId,
      sessionId,
      onMessage: (msg: AgentStreamMessage) => {
        pushMessage(sessionId, msg);
      },
      onComplete: async (result: AgentResult) => {
        completeSession(sessionId, result);

        await db.agentSession.update({
          where: { id: sessionId },
          data: {
            tokensInput: { increment: result.tokensInput },
            tokensOutput: { increment: result.tokensOutput },
          },
        });

        const cost = estimateCost(
          modelTier,
          result.tokensInput,
          result.tokensOutput
        );
        await db.usageRecord.create({
          data: {
            userId: user.id,
            bookId,
            agentType: workflow.primaryAgent,
            model: modelTier,
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
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error(
      "POST /api/books/:id/agent/:sessionId/message error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
