import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateWorkflowCost } from "@/lib/llm/cost-estimator";
import { validatePrices } from "@/lib/llm/price-validator";
import { checkQuota } from "@/lib/billing/quota-checker";
import {
  resolveModelForRole,
  resolveConductorModel,
  meetsMinimumTier,
  mapAgentTypeToRole,
  resolveProviderRoute,
  validateApiKey,
  type ProviderKey,
  type AgentRole,
  type BookModelSettings,
} from "@/lib/llm";
import Anthropic from "@anthropic-ai/sdk";
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
  addUserMessage,
  addAssistantMessage,
} from "@/lib/agents";
import type {
  AgentStreamMessage,
  AgentResult,
  AgentType,
  SharedCostTracker,
  DelegationContext,
} from "@/lib/agents";
import { processPostSession } from "@/lib/agents";
import { enqueueAgentJob } from "@/lib/queue";
import type { AgentJobData } from "@/lib/queue";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** Safety multiplier applied to the pre-session max cost estimate. */
const BUDGET_SAFETY_FACTOR = 2;
/** Lower bound for the per-session budget so tight estimates don't strangle sessions. */
const MIN_SESSION_BUDGET_USD = 5;

const startSessionSchema = z.object({
  workflowId: z.string().min(1),
  chapterNumber: z.number().int().min(1).max(999).optional(),
  message: z.string().max(10000).optional(),
  pageContext: pageContextSchema,
});

/** POST /api/books/:id/agent -- start a new agent session. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
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

    // -- Setup Completeness Guard (SETUP-07) --
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

    // -- Model Resolution (4-level chain) --
    const settings = book.settings;

    // Load user's global defaults and role overrides
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

    // Build global role overrides from User model
    const globalRoleOverrides: Record<AgentRole, string | null> = {
      ghostwriter: dbUser?.modelGhostwriter ?? null,
      editor: dbUser?.modelEditor ?? null,
      "beta-reader": dbUser?.modelBetaReader ?? null,
      analyst: dbUser?.modelAnalyst ?? null,
      coach: dbUser?.modelCoach ?? null,
      creative: dbUser?.modelCreative ?? null,
    };

    // Build BookModelSettings from BookSettings
    const bookModelSettings: BookModelSettings | null = settings
      ? {
          modelGhostwriter: settings.modelGhostwriter ?? "default",
          modelEditor: settings.modelEditor ?? "default",
          modelBetaReader: settings.modelBetaReader ?? "default",
          modelAnalyst: settings.modelAnalyst ?? "default",
          modelCoach: settings.modelCoach ?? "default",
          modelCreative: settings.modelCreative ?? "default",
          modelOverride: settings.modelOverride ?? null,
        }
      : null;

    // Resolve the specialist model to determine provider + enforce min tier
    const specialistRole = mapAgentTypeToRole(workflow.primaryAgent);
    const specialistResolved = resolveModelForRole(
      specialistRole,
      bookModelSettings,
      globalRoleOverrides,
      userDefault
    );

    // Resolve the Coach conductor honestly via the same 4-level chain the
    // specialists use (book-role → book-default → global-role → global-default).
    // This honors the user's coach-role choice instead of forcing sonnet; the
    // resolved model's provider decides which API key the routing below requires.
    // Terminal fallback (anthropic/sonnet) is baked into resolveConductorModel.
    const coachResolved = resolveConductorModel(bookModelSettings, {
      defaultModel: dbUser?.defaultModel ?? null,
      modelGhostwriter: dbUser?.modelGhostwriter ?? null,
      modelEditor: dbUser?.modelEditor ?? null,
      modelBetaReader: dbUser?.modelBetaReader ?? null,
      modelAnalyst: dbUser?.modelAnalyst ?? null,
      modelCoach: dbUser?.modelCoach ?? null,
      modelCreative: dbUser?.modelCreative ?? null,
    });
    const effectiveCoachRegistryId = coachResolved.registryId;
    const effectiveCoachModelDef = coachResolved.modelDef;

    // -- Minimum Tier Check --
    if (workflow.minimumTier && !meetsMinimumTier(specialistResolved.registryId, workflow.minimumTier)) {
      return NextResponse.json(
        {
          error: `This workflow requires at least a ${workflow.minimumTier}-class model. Your current model (${specialistResolved.modelDef.displayName}) is ${specialistResolved.modelDef.tier}-class. Change it in Settings or Book Settings.`,
          blocked: true,
        },
        { status: 422 }
      );
    }

    // -- Multi-Provider Key Loading --
    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id },
      select: { provider: true, encryptedKey: true, validatedAt: true },
    });

    // Build decrypted keys map (only include validated keys)
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      if (k.validatedAt) {
        try {
          decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
        } catch {
          // Skip keys that fail to decrypt
        }
      }
    }

    // Build available keys for provider routing
    const availableKeys = {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    };

    // -- Route Resolution for Coach --
    const coachRoute = resolveProviderRoute(
      effectiveCoachModelDef.provider,
      availableKeys,
      effectiveCoachModelDef.modelId,
      effectiveCoachRegistryId
    );

    if (coachRoute.route === "none") {
      const providerName = effectiveCoachModelDef.provider.charAt(0).toUpperCase() + effectiveCoachModelDef.provider.slice(1);
      return NextResponse.json(
        { error: `No ${providerName} API key configured. Add one in Settings > API Keys.` },
        { status: 400 }
      );
    }

    // -- Session-Start Key Re-validation --
    const keyToValidate = coachRoute.apiKey;
    // Determine which provider to validate against (the actual key provider, not litellm)
    const validationProvider: ProviderKey =
      coachRoute.route === "litellm-proxy"
        ? (coachRoute.headers?.["x-target-provider"] as ProviderKey ?? effectiveCoachModelDef.provider as ProviderKey)
        : coachRoute.route === "openrouter"
          ? "openrouter"
          : effectiveCoachModelDef.provider as ProviderKey;

    // For litellm-proxy, validate the actual provider key, not the litellm passthrough key
    const actualKeyForValidation =
      coachRoute.route === "litellm-proxy" && coachRoute.headers?.["x-provider-key"]
        ? coachRoute.headers["x-provider-key"]
        : keyToValidate;

    // Only re-validate if we have a real key (not the litellm passthrough)
    if (actualKeyForValidation && actualKeyForValidation !== "sk-litellm") {
      const keyValid = await validateApiKey(validationProvider, actualKeyForValidation);
      if (!keyValid.valid) {
        const providerName = validationProvider.charAt(0).toUpperCase() + validationProvider.slice(1);
        return NextResponse.json(
          { error: `Your ${providerName} API key is no longer valid: ${keyValid.error}. Please update it in Settings.` },
          { status: 400 }
        );
      }
    }

    // -- Build Coach LLM Client --
    const effectiveModelId = coachRoute.effectiveModelId || effectiveCoachModelDef.modelId;
    const coachClient = new Anthropic({
      apiKey: coachRoute.apiKey,
      baseURL: coachRoute.baseURL,
      ...(coachRoute.headers ? { defaultHeaders: coachRoute.headers } : {}),
    });

    // -- Specialist Client Factory --
    const createSpecialistClient = async (agentType: AgentType) => {
      const specialistDef = getAgentDefinition(agentType);
      if (!specialistDef) throw new Error(`Unknown specialist: ${agentType}`);

      const role = mapAgentTypeToRole(agentType);
      const resolved = resolveModelForRole(
        role,
        bookModelSettings,
        globalRoleOverrides,
        userDefault
      );

      // Resolve routing for this specialist
      const specRoute = resolveProviderRoute(
        resolved.modelDef.provider,
        availableKeys,
        resolved.modelDef.modelId,
        resolved.registryId
      );

      if (specRoute.route === "none") {
        // Fall back to the coach's provider to keep the session working
        const specModelId = effectiveModelId;
        return {
          client: coachClient,
          modelId: specModelId,
          registryId: effectiveCoachRegistryId,
        };
      }

      const specEffectiveModelId = specRoute.effectiveModelId || resolved.modelDef.modelId;
      const specClient = new Anthropic({
        apiKey: specRoute.apiKey,
        baseURL: specRoute.baseURL,
        ...(specRoute.headers ? { defaultHeaders: specRoute.headers } : {}),
      });

      return {
        client: specClient,
        modelId: specEffectiveModelId,
        registryId: resolved.registryId,
      };
    };

    // -- Workflow-specific timeout ceiling --
    const estimatedMaxMin = workflow.estimatedMaxMinutes ?? 30;
    const serverCeilingMs = (estimatedMaxMin + 30) * 60 * 1000;

    // Create DB session record (needed for both inline and background paths)
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

    // Record pre-session cost estimate for drift tracking
    const preEstimate = estimateWorkflowCost(data.workflowId, effectiveCoachRegistryId);
    await db.agentSession.update({
      where: { id: dbSession.id },
      data: { estimatedCostUsd: preEstimate.max },
    });

    // Finite per-session budget derived from the workflow estimate.
    // CRITICAL: must be finite — Infinity does not survive BullMQ's JSON
    // serialization (it becomes null, silently falling back to defaults).
    const sessionBudgetUsd = Math.max(
      preEstimate.max * BUDGET_SAFETY_FACTOR,
      MIN_SESSION_BUDGET_USD
    );

    // Fire-and-forget: validate pricing on first use (24h cache)
    validatePrices().catch(() => {});

    // -- Dual-path routing: long workflows go to background queue --
    // Conversational workflows must stay inline (user needs to interact)
    const isLongRunning =
      !workflow.conversational && (workflow.estimatedMaxMinutes ?? 5) > 5;

    if (isLongRunning) {
      // --- Background Queue Path ---
      // Serialize page context to JSON string for Redis
      const serializedPageContext = data.pageContext ? JSON.stringify(data.pageContext) : undefined;

      const jobData: AgentJobData = {
        sessionId: dbSession.id,
        bookId,
        userId: user.id,
        workflowId: data.workflowId,
        agentType: workflow.primaryAgent,
        chapterNumber: data.chapterNumber,
        coachRegistryId: effectiveCoachRegistryId,
        coachModelId: effectiveModelId,
        providerKey: validationProvider,
        language: book.language ?? "en",
        bookName: book.name,
        message: data.message,
        pageContext: serializedPageContext,
        sessionCostLimit: sessionBudgetUsd,
        serverCeilingMs,
        isConversational: workflow.conversational,
      };

      const job = await enqueueAgentJob(jobData);

      // Store jobId in DB so the SSE stream route knows this is a background job
      await db.agentSession.update({
        where: { id: dbSession.id },
        data: { jobId: job.id },
      });

      return NextResponse.json({
        sessionId: dbSession.id,
        queued: true,
        jobId: job.id,
      });
    } else {
      // --- Existing Inline SSE Path (unchanged) ---

      // Create in-memory session
      const session = createSession(
        dbSession.id,
        bookId,
        user.id,
        "writing-coach",
        data.workflowId
      );

      // -- Shared Cost Tracker --
      const sharedCostTracker: SharedCostTracker = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
      };

      // -- Delegation Context --
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
        client: coachClient,
        modelId: effectiveModelId,
        registryId: effectiveCoachRegistryId,
        maxRuntimeMs: serverCeilingMs,
        maxSessionCostUsd: sessionBudgetUsd,
        sharedCostTracker,
        delegationContext,
        providerKey: validationProvider,
      });
      session.orchestrator = orchestrator;

      const spawnOptions = {
        agentType: "writing-coach" as const,
        model: effectiveCoachModelDef.tier,
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
          // Run post-session processing (parse reports, store findings, advance status).
          // Skipped for user-cancelled sessions — the cancel route owns the
          // terminal state and already notified listeners via cancelSession —
          // AND for failed sessions (D-36: a provider-failure run must not
          // advance chapter workflow state).
          let suggestedNext: string[] = [];
          let resultMeta: {
            findingsCreated: number;
            statusAdvanced: boolean;
            newStatus?: string;
            betaGateResult?: string;
          } = { findingsCreated: 0, statusAdvanced: false };
          if (!result.cancelled && result.success) {
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
              // Log without exposing sensitive data
              const errMsg = e instanceof Error ? e.message : "Unknown error";
              console.error("[PostSession] Error:", errMsg);
            }
          }

          // Attach result metadata to the AgentResult for SSE propagation.
          // Cancelled sessions complete as success:false so the in-memory
          // session stays "failed" (matching the cancel route's DB status).
          const enrichedResult = {
            ...result,
            success: result.cancelled ? false : result.success,
            resultMeta,
          };
          completeSession(dbSession.id, enrichedResult, suggestedNext);

          // Persist the assistant's reply so a continued conversational session
          // survives a server restart with full context (fire-safe).
          if (!result.cancelled && result.assistantText) {
            await addAssistantMessage(dbSession.id, result.assistantText);
          }

          // Update DB records -- include shared cost tracker totals.
          // totalCostUsd is accumulated per-turn at each orchestrator's OWN
          // model rate, so Opus specialists are priced correctly.
          const totalInput = sharedCostTracker.totalInputTokens;
          const totalOutput = sharedCostTracker.totalOutputTokens;
          const cost = sharedCostTracker.totalCostUsd;
          await db.agentSession.update({
            where: { id: dbSession.id },
            data: {
              // Never overwrite the cancel route's "failed" with "completed".
              status: result.cancelled
                ? "failed"
                : result.success
                  ? "completed"
                  : "failed",
              tokensInput: totalInput,
              tokensOutput: totalOutput,
              completedAt: new Date(),
              actualCostUsd: cost,
            },
          });

          // Create usage record with total tokens (Coach + all specialists)
          await db.usageRecord.create({
            data: {
              userId: user.id,
              bookId,
              agentType: "writing-coach",
              model: effectiveCoachRegistryId,
              tokensInput: totalInput,
              tokensOutput: totalOutput,
              costEstimate: cost,
              keySource: "user",
            },
          });
        },
        onError: async (error: Error, partial?: { documentIds: string[] }) => {
          // Sanitize error before sending to client
          onMessage({
            type: "error",
            content: "An error occurred during the agent session. Please try again.",
          });
          completeSession(dbSession.id, {
            success: false,
            tokensInput: 0,
            tokensOutput: 0,
            // Report documents that were written before the error — don't
            // mislead consumers with an empty list (F7).
            documentIds: partial?.documentIds ?? [],
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

      // Persist the initial user message so the first turn is part of the
      // rehydratable history for later /message continuations (fire-safe).
      if (data.message) {
        await addUserMessage(dbSession.id, data.message);
      }

      // Fire and forget
      orchestrator.runAgent(spawnOptions).catch(() => {});

      return NextResponse.json({ sessionId: dbSession.id });
    }
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
    // Sanitize: never expose raw error details
    console.error("POST /api/books/:id/agent error:", (error as Error).message ?? "Unknown error");
    return NextResponse.json(
      { error: "Failed to start agent session" },
      { status: 500 }
    );
  }
}
