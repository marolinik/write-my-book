/**
 * BullMQ worker processor for background agent sessions.
 *
 * This function is called by a BullMQ Worker for each queued agent job.
 * It reconstructs the full orchestrator from serialized job data,
 * re-fetches API keys from the database (NEVER from job data),
 * and publishes progress to Redis pub/sub channels.
 *
 * Progress delivery:
 * - Redis PUBLISH to `session:{sessionId}` channel (real-time SSE delivery)
 * - Redis RPUSH to `session:{sessionId}:messages` list (catch-up for late subscribers)
 * - Redis SET for `session:{sessionId}:status` (completion/failure state)
 *
 * Approval gates:
 * - Redis SET for `approval:{approvalId}` with pending status + 10min TTL
 * - Worker polls Redis every 2s until approval resolves or times out
 */

import { UnrecoverableError, type Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentJobData } from "./agent-queue";
import { createRedisConnection } from "./connection";
import { AgentOrchestrator } from "@/lib/agents/orchestrator";
import { processPostSession } from "@/lib/agents/post-session";
import { getWorkflow, getAgentDefinition } from "@/lib/agents";
import type {
  AgentStreamMessage,
  AgentResult,
  AgentType,
  SharedCostTracker,
  DelegationContext,
  PageContext,
} from "@/lib/agents/types";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { estimateWorkflowCost } from "@/lib/llm/cost-estimator";
import {
  resolveModelForRole,
  mapAgentTypeToRole,
  resolveProviderRoute,
  getModelDef,
  type ProviderKey,
  type AgentRole,
  type BookModelSettings,
} from "@/lib/llm";

// ── Constants ─────────────────────────────────────────────────────────

/** How long approval requests wait before timing out (10 minutes). */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

/** How often to poll Redis for approval responses (2 seconds). */
const APPROVAL_POLL_INTERVAL_MS = 2_000;

/** TTL for messages list and status keys in Redis (24 hours). */
const REDIS_TTL_SECONDS = 86_400;

/** Check the cancellation flag every Nth message to limit Redis round-trips. */
const CANCEL_CHECK_INTERVAL = 5;

// ── Types ─────────────────────────────────────────────────────────────

interface ApprovalState {
  status: "pending" | "approved" | "rejected" | "modified";
  decision?: "approve" | "reject" | "modify";
  message?: string;
}

/**
 * Sentinel error thrown when a user cancels a background job.
 * Extends BullMQ's UnrecoverableError so the job is NOT retried.
 */
class SessionCancelledError extends UnrecoverableError {
  constructor() {
    super("Session cancelled by user");
    this.name = "SessionCancelledError";
  }
}

// ── Worker Processor ──────────────────────────────────────────────────

/**
 * Process an agent job in the background worker.
 *
 * Reconstructs the full orchestrator from serialized job data:
 * 1. Re-fetches API keys from DB (never stored in job data)
 * 2. Resolves provider routing for coach + specialist models
 * 3. Creates Anthropic SDK clients
 * 4. Builds delegation context with Redis-based message delivery
 * 5. Runs the orchestrator tool-use loop
 * 6. On completion: processes post-session, updates DB, creates usage record
 */
export async function processAgentJob(job: Job<AgentJobData>): Promise<void> {
  const {
    sessionId,
    bookId,
    userId,
    workflowId,
    agentType,
    chapterNumber,
    coachRegistryId,
    coachModelId,
    providerKey,
    language,
    bookName,
    message,
    pageContext: pageContextJson,
    sessionCostLimit,
    serverCeilingMs,
    isConversational,
  } = job.data;

  // Create a dedicated Redis publisher for this job
  const publisher = createRedisConnection();

  // Cancellation state — declared outside try so catch can read it
  let cancelDetected = false;
  const cancelKey = `session:${sessionId}:cancel`;

  try {
    // ── Redis Message Publishing ────────────────────────────────────

    /**
     * Publish a message to both the real-time channel and the catch-up list.
     * The SSE endpoint subscribes to the channel for live delivery.
     * Late-connecting clients read from the list to catch up.
     */
    async function publishMessage(msg: AgentStreamMessage): Promise<void> {
      const serialized = JSON.stringify(msg);
      await publisher.publish(`session:${sessionId}`, serialized);
      await publisher.rpush(`session:${sessionId}:messages`, serialized);
      await publisher.expire(
        `session:${sessionId}:messages`,
        REDIS_TTL_SECONDS
      );
    }

    // ── Re-fetch API Keys from Database ─────────────────────────────

    const userKeys = await db.apiKey.findMany({
      where: { userId },
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

    const availableKeys = {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    };

    // ── Build Coach LLM Client ──────────────────────────────────────

    const coachModelDef = getModelDef(coachRegistryId);
    if (!coachModelDef) {
      throw new Error(
        `Coach model not found in registry: ${coachRegistryId}`
      );
    }

    const coachRoute = resolveProviderRoute(
      coachModelDef.provider,
      availableKeys,
      coachModelId,
      coachRegistryId
    );

    if (coachRoute.route === "none") {
      await publishMessage({
        type: "error",
        content: `No API key available for ${coachModelDef.provider}. Add one in Settings > API Keys.`,
      });
      throw new Error(`No API key for provider: ${coachModelDef.provider}`);
    }

    const effectiveModelId =
      coachRoute.effectiveModelId || coachModelDef.modelId;

    const coachClient = new Anthropic({
      apiKey: coachRoute.apiKey,
      baseURL: coachRoute.baseURL,
      ...(coachRoute.headers ? { defaultHeaders: coachRoute.headers } : {}),
    });

    // ── Build Specialist Client Factory ─────────────────────────────

    // Load book settings for model resolution
    const book = await db.book.findFirst({
      where: { id: bookId, userId },
      include: { settings: true },
    });

    if (!book) {
      throw new Error(`Book not found: ${bookId}`);
    }

    const settings = book.settings;
    const dbUser = await db.user.findUnique({
      where: { id: userId },
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
    const globalRoleOverrides: Record<AgentRole, string | null> = {
      ghostwriter: dbUser?.modelGhostwriter ?? null,
      editor: dbUser?.modelEditor ?? null,
      "beta-reader": dbUser?.modelBetaReader ?? null,
      analyst: dbUser?.modelAnalyst ?? null,
      coach: dbUser?.modelCoach ?? null,
      creative: dbUser?.modelCreative ?? null,
    };

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

    const createSpecialistClient = async (specAgentType: AgentType) => {
      const specialistDef = getAgentDefinition(specAgentType);
      if (!specialistDef) {
        throw new Error(`Unknown specialist: ${specAgentType}`);
      }

      const role = mapAgentTypeToRole(specAgentType);
      const resolved = resolveModelForRole(
        role,
        bookModelSettings,
        globalRoleOverrides,
        userDefault
      );

      const specRoute = resolveProviderRoute(
        resolved.modelDef.provider,
        availableKeys,
        resolved.modelDef.modelId,
        resolved.registryId
      );

      if (specRoute.route === "none") {
        // Fall back to the coach's provider
        return {
          client: coachClient,
          modelId: effectiveModelId,
          registryId: coachRegistryId,
        };
      }

      const specEffectiveModelId =
        specRoute.effectiveModelId || resolved.modelDef.modelId;
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

    // ── Shared Cost Tracker ─────────────────────────────────────────

    const sharedCostTracker: SharedCostTracker = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    // ── Delegation Context ──────────────────────────────────────────

    const delegationContext: DelegationContext = {
      parentSessionId: sessionId,
      parentOnMessage: (msg: AgentStreamMessage) => {
        // Fire-and-forget: don't await in the delegation callback
        publishMessage(msg).catch((err) =>
          console.error(
            "[AgentWorker] Failed to publish delegation message:",
            err
          )
        );
      },
      sharedCostTracker,
      language,
      chapterNumber,
      createSpecialistClient,
    };

    // ── Record Pre-Session Cost Estimate ─────────────────────────────

    const preEstimate = estimateWorkflowCost(workflowId, coachRegistryId);
    await db.agentSession.update({
      where: { id: sessionId },
      data: { estimatedCostUsd: preEstimate.max },
    });

    // ── Create Orchestrator ─────────────────────────────────────────

    const workflow = getWorkflow(workflowId);
    const orchestrator = new AgentOrchestrator({
      client: coachClient,
      modelId: effectiveModelId,
      registryId: coachRegistryId,
      maxRuntimeMs: serverCeilingMs,
      maxSessionCostUsd: sessionCostLimit,
      sharedCostTracker,
      delegationContext,
      providerKey: providerKey as ProviderKey,
      // Redis-based approval resolver for background sessions
      approvalResolver: async (approvalId, deadline) => {
        // Write pending state to Redis so the approve route can find it
        const ttl = Math.max(Math.ceil((deadline - Date.now()) / 1000), 60);
        await publisher.set(
          `approval:${approvalId}`,
          JSON.stringify({ status: "pending" }),
          "EX",
          ttl
        );

        // Poll Redis for resolution every 2 seconds
        while (Date.now() < deadline) {
          if (cancelDetected) {
            await publisher.del(`approval:${approvalId}`);
            return { decision: "reject" as const, message: "Session cancelled" };
          }

          const raw = await publisher.get(`approval:${approvalId}`);
          if (raw) {
            try {
              const state = JSON.parse(raw) as ApprovalState;
              if (state.status !== "pending" && state.decision) {
                await publisher.del(`approval:${approvalId}`);
                return { decision: state.decision, message: state.message };
              }
            } catch {
              // Invalid JSON — keep polling
            }
          }

          await new Promise((resolve) =>
            setTimeout(resolve, APPROVAL_POLL_INTERVAL_MS)
          );
        }

        // Timeout — clean up and reject
        await publisher.del(`approval:${approvalId}`);
        return {
          decision: "reject" as const,
          message: "Approval timed out after 10 minutes",
        };
      },
    });

    // ── Cancellation Detection ──────────────────────────────────────

    let messageCount = 0;

    /**
     * Check whether the user has requested cancellation via the cancel route.
     * Called periodically (every CANCEL_CHECK_INTERVAL messages) to avoid
     * a Redis round-trip on every single streamed token.
     */
    async function checkCancellation(): Promise<void> {
      if (cancelDetected) return;
      try {
        const flag = await publisher.get(cancelKey);
        if (flag === "true") {
          cancelDetected = true;
          // Clean up the cancel flag
          await publisher.del(cancelKey);
          // Set terminal status as safety net (cancel route also sets this)
          await publisher.set(
            `session:${sessionId}:status`,
            "failed",
            "EX",
            REDIS_TTL_SECONDS
          );
          // Stop the orchestrator
          orchestrator.cancel();
          console.log(
            `[AgentWorker] Cancellation detected for session ${sessionId}`
          );
        }
      } catch (err) {
        // Non-fatal: cancel check failure should not break the session
        console.warn("[AgentWorker] Cancel check failed:", err);
      }
    }

    // ── Message Callback ────────────────────────────────────────────

    const onMessage = (msg: AgentStreamMessage) => {
      publishMessage(msg).catch((err) =>
        console.error("[AgentWorker] Failed to publish message:", err)
      );
      job
        .updateProgress({ lastMessage: msg.type })
        .catch(() => {
          /* BullMQ progress update is best-effort */
        });

      // Periodically check for user-initiated cancellation
      messageCount++;
      if (messageCount % CANCEL_CHECK_INTERVAL === 0) {
        checkCancellation().catch(() => {
          /* best-effort cancel detection */
        });
      }
    };

    // ── Completion Callback ─────────────────────────────────────────

    const onComplete = async (result: AgentResult) => {
      try {
        // Run post-session processing
        let suggestedNext: string[] = [];
        let resultMeta: {
          findingsCreated: number;
          statusAdvanced: boolean;
          newStatus?: string;
          betaGateResult?: string;
        } = { findingsCreated: 0, statusAdvanced: false };

        try {
          const postResult = await processPostSession({
            sessionId,
            bookId,
            userId,
            workflowId,
            agentType: workflow?.primaryAgent ?? (agentType as AgentType),
            chapterNumber,
          });
          suggestedNext = postResult.suggestedNext;
          resultMeta = {
            findingsCreated: postResult.findingsCreated,
            statusAdvanced: postResult.statusAdvanced,
            newStatus: postResult.newStatus,
            betaGateResult: postResult.betaGateResult,
          };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : "Unknown error";
          console.error("[AgentWorker][PostSession] Error:", errMsg);
        }

        // Update DB records with shared cost tracker totals
        const totalInput = sharedCostTracker.totalInputTokens;
        const totalOutput = sharedCostTracker.totalOutputTokens;
        const cost = estimateCost(coachRegistryId, totalInput, totalOutput);

        await db.agentSession.update({
          where: { id: sessionId },
          data: {
            status: result.success ? "completed" : "failed",
            tokensInput: totalInput,
            tokensOutput: totalOutput,
            completedAt: new Date(),
            actualCostUsd: cost,
          },
        });

        // Create usage record
        await db.usageRecord.create({
          data: {
            userId,
            bookId,
            agentType: "writing-coach",
            model: coachRegistryId,
            tokensInput: totalInput,
            tokensOutput: totalOutput,
            costEstimate: cost,
            keySource: "user",
          },
        });

        // Publish completion message
        await publishMessage({
          type: "complete",
          content: result.success
            ? "Session completed successfully"
            : "Session completed with errors",
          metadata: {
            ...resultMeta,
            suggestedNext,
            tokensInput: totalInput,
            tokensOutput: totalOutput,
            costUsd: cost,
          },
        });

        // Set status key for polling clients
        await publisher.set(
          `session:${sessionId}:status`,
          "completed",
          "EX",
          REDIS_TTL_SECONDS
        );
      } catch (err) {
        console.error("[AgentWorker] onComplete error:", err);
      }
    };

    // ── Error Callback ──────────────────────────────────────────────

    const onError = async (error: Error) => {
      try {
        await publishMessage({
          type: "error",
          content:
            "An error occurred during the agent session. Please try again.",
        });

        await db.agentSession.update({
          where: { id: sessionId },
          data: {
            status: "failed",
            completedAt: new Date(),
          },
        });

        await publisher.set(
          `session:${sessionId}:status`,
          "failed",
          "EX",
          REDIS_TTL_SECONDS
        );
      } catch (err) {
        console.error("[AgentWorker] onError handler failed:", err);
      }
    };

    // ── Parse PageContext ───────────────────────────────────────────

    let pageContext: PageContext | undefined;
    if (pageContextJson) {
      try {
        pageContext = JSON.parse(pageContextJson) as PageContext;
      } catch {
        // Invalid JSON — skip page context
      }
    }

    // ── Run Orchestrator ────────────────────────────────────────────

    const spawnOptions = {
      agentType: (agentType as AgentType) || ("writing-coach" as const),
      model: coachModelDef.tier,
      context: {
        bookId,
        bookName,
        userId,
        chapterNumber,
        language,
        targetWorkflowId: workflowId,
        targetAgentType: workflow?.primaryAgent,
        userMessage: message,
        pageContext,
      },
      workflowId,
      sessionId,
      onMessage,
      onComplete,
      onError,
    } as const;

    await orchestrator.runAgent(spawnOptions);

    // After orchestrator completes, check if it was due to cancellation
    if (cancelDetected) {
      throw new SessionCancelledError();
    }
  } catch (err) {
    // Re-throw cancellation errors to skip BullMQ retry
    if (err instanceof SessionCancelledError) {
      throw err;
    }
    // Check if the error is an abort caused by our cancellation
    if (
      cancelDetected ||
      (err instanceof Error && err.message?.includes("aborted"))
    ) {
      throw new SessionCancelledError();
    }
    // All other errors propagate normally (BullMQ handles retry)
    throw err;
  } finally {
    // Always clean up the Redis publisher connection
    publisher.disconnect();
  }
}

// ── Approval Gate via Redis Polling ─────────────────────────────────

/**
 * Wait for an approval response by polling Redis.
 * Used by background workers since they can't use in-memory Promise maps.
 *
 * The SSE API endpoint writes approval decisions to Redis at:
 *   approval:{approvalId} = JSON { status, decision, message }
 *
 * This function polls every 2 seconds until:
 * - The approval is resolved (approved/rejected/modified)
 * - The timeout expires (10 minutes)
 *
 * NOTE: This function is exported for use by future approval-gate integration.
 * The current orchestrator uses in-memory Promise-based approvals.
 * When the worker needs to intercept approval gates, this function
 * provides the Redis-based polling alternative.
 */
export async function waitForApproval(
  publisher: ReturnType<typeof createRedisConnection>,
  sessionId: string,
  approvalId: string,
  request: { title?: string; description?: string }
): Promise<{ decision: "approve" | "reject" | "modify"; message?: string }> {
  // Write pending approval state to Redis
  await publisher.set(
    `approval:${approvalId}`,
    JSON.stringify({ status: "pending" } as ApprovalState),
    "EX",
    Math.ceil(APPROVAL_TIMEOUT_MS / 1000)
  );

  // Publish the approval request message
  const approvalMsg: AgentStreamMessage = {
    type: "approval_request",
    content: request.description ?? "Approval requested",
    metadata: {
      approvalId,
      approvalTitle: request.title,
      approvalDeadline: Date.now() + APPROVAL_TIMEOUT_MS,
    },
  };
  const serialized = JSON.stringify(approvalMsg);
  await publisher.publish(`session:${sessionId}`, serialized);
  await publisher.rpush(`session:${sessionId}:messages`, serialized);
  await publisher.expire(`session:${sessionId}:messages`, REDIS_TTL_SECONDS);

  // Poll for resolution
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const raw = await publisher.get(`approval:${approvalId}`);
    if (raw) {
      try {
        const state = JSON.parse(raw) as ApprovalState;
        if (state.status !== "pending" && state.decision) {
          // Clean up
          await publisher.del(`approval:${approvalId}`);
          return { decision: state.decision, message: state.message };
        }
      } catch {
        // Invalid JSON in Redis — keep polling
      }
    }

    // Wait before next poll
    await new Promise((resolve) =>
      setTimeout(resolve, APPROVAL_POLL_INTERVAL_MS)
    );
  }

  // Timeout — clean up and reject
  await publisher.del(`approval:${approvalId}`);
  return {
    decision: "reject",
    message: "Approval timed out after 10 minutes",
  };
}
