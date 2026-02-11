import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { z } from "zod";
import {
  AgentOrchestrator,
  getWorkflow,
  getAgentDefinition,
  createSession,
  pushMessage,
  completeSession,
} from "@/lib/agents";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents";
import { processPostSession } from "@/lib/agents";

type RouteParams = { params: Promise<{ id: string }> };

const startSessionSchema = z.object({
  workflowId: z.string().min(1),
  chapterNumber: z.number().int().min(1).max(999).optional(),
  message: z.string().max(10000).optional(),
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

    // Get the agent definition
    const agentDef = getAgentDefinition(workflow.primaryAgent);
    if (!agentDef) {
      return NextResponse.json(
        { error: "Unknown agent type" },
        { status: 400 }
      );
    }

    // Resolve API key
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
        {
          error: "No Anthropic API key configured. Add one in Settings.",
        },
        { status: 400 }
      );
    }

    // Determine model tier based on book settings
    const settings = book.settings;
    let modelTier = agentDef.defaultModel;
    if (settings) {
      const agentType = workflow.primaryAgent;
      if (agentType === "ghostwriter" && settings.modelGhostwriter) {
        modelTier = settings.modelGhostwriter as "opus" | "sonnet";
      } else if (
        ["dev-editor", "line-editor", "continuity-checker"].includes(agentType) &&
        settings.modelEditor
      ) {
        modelTier = settings.modelEditor as "opus" | "sonnet" | "haiku";
      } else if (agentType === "beta-reader" && settings.modelBetaReader) {
        modelTier = settings.modelBetaReader as "opus" | "sonnet" | "haiku";
      } else if (agentType === "manuscript-analyst" && settings.modelAnalyst) {
        modelTier = settings.modelAnalyst as "sonnet" | "haiku";
      }
    }

    // Create DB session record
    const dbSession = await db.agentSession.create({
      data: {
        bookId,
        userId: user.id,
        agentType: workflow.primaryAgent,
        status: "running",
      },
    });

    // Create in-memory session
    const session = createSession(
      dbSession.id,
      bookId,
      user.id,
      workflow.primaryAgent,
      data.workflowId
    );

    // Spawn orchestrator (fire and forget)
    const orchestrator = new AgentOrchestrator(apiKey);
    session.orchestrator = orchestrator;

    const spawnOptions = {
      agentType: workflow.primaryAgent,
      model: modelTier,
      context: {
        bookId,
        userId: user.id,
        chapterNumber: data.chapterNumber,
        language: book.language,
      },
      workflowId: data.workflowId,
      sessionId: dbSession.id,
      onMessage: (message: AgentStreamMessage) => {
        pushMessage(dbSession.id, message);
      },
      onComplete: async (result: AgentResult) => {
        // Run post-session processing (parse reports, store findings, advance status)
        let suggestedNext: string[] = [];
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
        } catch (e) {
          console.error("[PostSession] Error:", e);
        }

        completeSession(dbSession.id, result);

        // Update DB records
        await db.agentSession.update({
          where: { id: dbSession.id },
          data: {
            status: result.success ? "completed" : "failed",
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            completedAt: new Date(),
          },
        });

        // Create usage record
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
