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
import { createSessionBrief } from "@/lib/agents/session-brief";
import {
  getWorkflow,
  getAgentDefinition,
  addUserMessage,
  addAssistantMessage,
} from "@/lib/agents";
import { normalizeSessionCostLimit } from "@/lib/agents/budget";
import { shouldRunBatchChild } from "@/lib/agents/batch-budget";
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

/**
 * Batch circuit-breaker thresholds (owner decision, BATCH-SPEC §9.2):
 * trip `halted` on 3 CONSECUTIVE or 5 TOTAL provider 429/auth/quota failures
 * across a batch's children. Too low kills a good overnight run on a transient
 * blip; too high defeats the guardrail.
 */
const BATCH_BREAKER_CONSECUTIVE_FAILURES = 3;
const BATCH_BREAKER_TOTAL_FAILURES = 5;

/**
 * HTTP statuses that count toward the batch circuit breaker: rate-limit (429),
 * auth (401/403), and quota/billing (402). Mirrors the retry-handler's
 * non-retryable auth/billing set + the 429 rate-limit status. A mid-batch
 * provider exhaustion of any of these, repeated across children, should halt
 * the batch rather than let each of N children burn its 3 BullMQ attempts.
 */
const BATCH_BREAKER_STATUSES = new Set([401, 402, 403, 429]);

/** Extract an HTTP status from an Anthropic SDK / ProviderError / fetch error. */
function extractErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    if (
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
    ) {
      return (error as { status: number }).status;
    }
    if (
      "statusCode" in error &&
      typeof (error as { statusCode: unknown }).statusCode === "number"
    ) {
      return (error as { statusCode: number }).statusCode;
    }
  }
  return null;
}

/** True iff the error is a provider 429/auth/quota failure (breaker-eligible). */
function isBatchBreakerError(error: unknown): boolean {
  const status = extractErrorStatus(error);
  return status !== null && BATCH_BREAKER_STATUSES.has(status);
}

/**
 * Record a breaker-eligible child failure against the batch and trip `halted`
 * once the consecutive- OR total-failure threshold is crossed. Best-effort:
 * a Redis hiccup here must never mask the underlying job error (the caller
 * re-throws for BullMQ retry regardless).
 */
async function recordBatchFailure(
  publisher: ReturnType<typeof createRedisConnection>,
  batchId: string
): Promise<void> {
  try {
    const [total, consecutive] = await Promise.all([
      publisher.incr(`batch:${batchId}:failures`),
      publisher.incr(`batch:${batchId}:consecutive`),
    ]);
    // Bound Redis growth (M2): stamp the shared 24h TTL on the breaker counters
    // the same way the spend ledger is bounded (mirrors the session:* pattern).
    await Promise.all([
      publisher.expire(`batch:${batchId}:failures`, REDIS_TTL_SECONDS),
      publisher.expire(`batch:${batchId}:consecutive`, REDIS_TTL_SECONDS),
    ]);
    if (
      total >= BATCH_BREAKER_TOTAL_FAILURES ||
      consecutive >= BATCH_BREAKER_CONSECUTIVE_FAILURES
    ) {
      await publisher.set(
        `batch:${batchId}:halted`,
        "1",
        "EX",
        REDIS_TTL_SECONDS
      );
    }
  } catch (err) {
    console.error("[AgentWorker] batch breaker update failed:", err);
  }
}

// ── Types ─────────────────────────────────────────────────────────────

interface ApprovalState {
  status: "pending" | "approved" | "rejected" | "modified";
  decision?: "approve" | "reject" | "modify";
  message?: string;
  /**
   * Owning agent session (M1 hardening). The approve route resolves this
   * key at its GLOBAL address `approval:{id}`, so without a binding the
   * gate was resolvable by whoever could guess/learn an approvalId from
   * any session's replay list. Pending writes stamp it; the approve route
   * requires it to equal the URL session.
   */
  sessionId?: string;
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
    batchId,
    batchBudgetCapUsd,
  } = job.data;

  // Create a dedicated Redis publisher for this job
  const publisher = createRedisConnection();

  // Cancellation state — declared outside try so catch can read it
  let cancelDetected = false;
  const cancelKey = `session:${sessionId}:cancel`;

  try {
    // ── Batch Pre-Child Budget / Breaker Guard ──────────────────────
    // For BATCH children only (byte-for-byte no-op when batchId is absent):
    // consult the aggregate ledger BEFORE building or running anything. If the
    // batch is over its dollar cap or the circuit breaker has halted it, mark
    // this child terminal as 'skipped' and return WITHOUT constructing the
    // orchestrator — so a halted batch never re-fetches keys, never calls a
    // provider, never spends. This returns normally (not a throw), so the
    // skipped child is NOT retried into spending (mirrors the non-retry
    // instinct of SessionCancelledError).
    if (batchId) {
      const [spentRaw, haltedRaw, countedRaw, batchRow] = await Promise.all([
        publisher.get(`batch:${batchId}:spent`),
        publisher.get(`batch:${batchId}:halted`),
        // Z8 idempotency marker: set atomically with this child's ledger
        // increment in onComplete (see below). Its presence means a PRIOR
        // attempt of THIS child already rolled its spend into the batch ledger.
        publisher.get(`batch:${batchId}:counted:${sessionId}`),
        // Durable fail-safe fallback (M3): if a prior child's ledger write threw
        // (e.g. Redis maxmemory+noeviction), the spent counter freezes at 0 and
        // the Redis `:halted` flag may be absent — a Redis-only guard would then
        // admit EVERY remaining child and defeat the cap. onComplete's catch
        // durably sets `BatchRun.halted` in Postgres for exactly this case, so
        // consult it here (in parallel — no added latency). `.catch(() => null)`
        // keeps Redis the primary signal if the DB read itself hiccups.
        db.batchRun
          .findUnique({ where: { id: batchId }, select: { halted: true } })
          .catch(() => null),
      ]);

      // ── Z8: Already-billed retry guard ──────────────────────────────
      // A stalled/crashed child whose spend was ALREADY recorded on a prior
      // attempt (the `counted:{sessionId}` marker is set atomically with that
      // ledger increment) must NOT run again: re-running would re-charge the
      // provider AND double-count spend. `sessionId` == BullMQ `jobId` is stable
      // across attempts and stalled re-runs, so it is the attempt-independent
      // idempotency key. Idempotently ensure a terminal status (the filter flips
      // ONLY a still-non-terminal row, never clobbering the completed/failed
      // status a prior onComplete already wrote) and return without building the
      // orchestrator — the same never-re-spend contract as the skip path below.
      if (countedRaw) {
        await db.agentSession.updateMany({
          where: { id: sessionId, status: { in: ["queued", "running"] } },
          data: { status: "failed", completedAt: new Date() },
        });
        return;
      }

      const spent = spentRaw ? parseFloat(spentRaw) : 0;
      const halted = haltedRaw === "1" || batchRow?.halted === true;
      if (
        !shouldRunBatchChild(spent, batchBudgetCapUsd ?? Infinity, halted)
      ) {
        await db.agentSession.update({
          where: { id: sessionId },
          data: { status: "skipped", completedAt: new Date() },
        });
        return; // never runs the orchestrator, never spends
      }

      // ── D-96: live "running" surface for batch children ─────────────
      // A batch child is created 'queued' (batch-flow) and, before this line,
      // only ever transitioned to a TERMINAL status — so the poll route's live
      // counts showed `running: 0` for the ENTIRE run and the batch polled as
      // "queued" while actively spending. Now that the pre-child budget/breaker
      // guard has ADMITTED this child, flip it 'running' before any key fetch or
      // LLM turn. The terminal onComplete/onError/catch paths overwrite this as
      // today; cost/turn recording is untouched. Non-batch sessions are already
      // created 'running' (schema default), so this is batch-only by design.
      await db.agentSession.update({
        where: { id: sessionId },
        data: { status: "running" },
      });
    }

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
      totalCostUsd: 0,
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

    // Validate the budget from job data — BullMQ JSON serialization turns
    // Infinity into null. Fall back to the orchestrator default ($10)
    // rather than running effectively unbounded.
    const validatedCostLimit = normalizeSessionCostLimit(sessionCostLimit);

    const workflow = getWorkflow(workflowId);
    const orchestrator = new AgentOrchestrator({
      client: coachClient,
      modelId: effectiveModelId,
      registryId: coachRegistryId,
      maxRuntimeMs: serverCeilingMs,
      maxSessionCostUsd: validatedCostLimit,
      sharedCostTracker,
      delegationContext,
      providerKey: providerKey as ProviderKey,
      // Redis-based approval resolver for background sessions
      approvalResolver: async (approvalId, deadline) => {
        // Write pending state to Redis so the approve route can find it
        const ttl = Math.max(Math.ceil((deadline - Date.now()) / 1000), 60);
        await publisher.set(
          `approval:${approvalId}`,
          JSON.stringify({ status: "pending", sessionId } satisfies ApprovalState),
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
        // Persist the assistant's reply so a continued session survives a
        // restart with full context (fire-safe — never throws).
        if (!result.cancelled && result.assistantText) {
          await addAssistantMessage(sessionId, result.assistantText);
        }

        // Run post-session processing — skipped for user-cancelled sessions
        // (the cancel route owns the terminal state; no completion processing)
        // AND for failed sessions (D-36: a provider-failure run must not
        // advance chapter workflow state — it did not complete its work).
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
              sessionId,
              bookId,
              userId,
              workflowId,
              agentType: workflow?.primaryAgent ?? (agentType as AgentType),
              chapterNumber,
              // Suppress chapter status auto-advance for batch children
              // (owner decision #7, BATCH-SPEC §6.3): a batch child records
              // findings but must NOT advance dev_edited/line_edited/beta_read.
              batchId,
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
        }

        // Update DB records with shared cost tracker totals.
        // totalCostUsd is accumulated per-turn at each orchestrator's OWN
        // model rate, so mixed-model sessions (Opus specialists under a
        // Sonnet conductor) are priced correctly.
        const totalInput = sharedCostTracker.totalInputTokens;
        const totalOutput = sharedCostTracker.totalOutputTokens;
        const cost = sharedCostTracker.totalCostUsd;

        // ── Batch Aggregate Ledger + Breaker (idempotent per child) ──
        // BATCH children only: roll this child's finalized spend into the
        // cross-child ledger (`batch:{id}:spent`) using the SAME per-turn-priced
        // value as the per-session cap, so batch spend is consistent with
        // per-session spend. If the aggregate cap is crossed, set the halted
        // flag so the pre-child guard skips every remaining child.
        //
        // Z8 idempotency: record this child's spend AT MOST ONCE across BullMQ
        // attempts. A stalled/crashed child can re-run onComplete; without a
        // guard the ledger + UsageRecord would double-count the writer's money.
        // The `counted:{sessionId}` marker is claimed with SET NX (atomic), so
        // exactly one attempt wins the right to record — a duplicate attempt
        // sees the marker, skips the increment, the breaker adjustment, AND the
        // UsageRecord create below. `sessionId` == `jobId` is the
        // attempt-independent idempotency key. `firstFinalize` stays true for
        // non-batch sessions (their record path is byte-identical to before).
        // Best-effort: never let ledger I/O break the completion path.
        let firstFinalize = true;
        if (batchId) {
          try {
            firstFinalize =
              (await publisher.set(
                `batch:${batchId}:counted:${sessionId}`,
                "1",
                "EX",
                REDIS_TTL_SECONDS,
                "NX"
              )) === "OK";

            if (firstFinalize) {
              const spentStr = await publisher.incrbyfloat(
                `batch:${batchId}:spent`,
                cost
              );
              // Bound Redis growth for high-volume nightly users (M2): the
              // ledger keys carry no natural TTL, so stamp the shared 24h TTL on
              // each write (mirrors the session:* pattern). Safe because the
              // ledger is only touched once a child actually runs and the digest
              // fans in hours later — comfortably inside 24h.
              await publisher.expire(
                `batch:${batchId}:spent`,
                REDIS_TTL_SECONDS
              );
              const spentNum = parseFloat(spentStr);
              if (
                batchBudgetCapUsd != null &&
                Number.isFinite(batchBudgetCapUsd) &&
                Number.isFinite(spentNum) &&
                spentNum >= batchBudgetCapUsd
              ) {
                await publisher.set(
                  `batch:${batchId}:halted`,
                  "1",
                  "EX",
                  REDIS_TTL_SECONDS
                );
              }

              // ── D-62: breaker counting on RESOLVED outcomes ──────────
              // A provider outage ends the loop by RESOLVING success:false
              // (endReason "error", D-36) — it never THROWS — so the thrown-
              // error breaker path in the catch below never fires for it. Count
              // resolved provider failures here too, else a batch keeps spending
              // through a total provider outage (no child ever trips `halted`).
              if (result.cancelled) {
                // User cancel: leave the breaker untouched — neither a genuine
                // success (don't reset the streak) nor a provider failure.
              } else if (result.success) {
                // A cleanly-completed child clears the consecutive-failure
                // streak (total failures are never reset — that's cumulative).
                await publisher.del(`batch:${batchId}:consecutive`);
              } else {
                // Provider-failure resolution: count it toward the breaker
                // exactly like a thrown breaker error. N consecutive (or the
                // total ceiling) trips `halted` → the pre-child guard skips the
                // rest → the digest surfaces an honest 'halted' state.
                await recordBatchFailure(publisher, batchId);
              }
            }
          } catch (err) {
            // FAIL SAFE (M3): if the ledger write threw (e.g. Redis
            // maxmemory+noeviction), `spent` freezes and a Redis-only pre-child
            // guard would admit every remaining child → the cap is DEFEATED.
            // Durably halt the batch in Postgres (the pre-child guard also reads
            // BatchRun.halted) and best-effort mirror the Redis flag. NEVER throw
            // out of this catch — the completion path must still finish.
            console.error(
              "[AgentWorker] batch ledger increment failed — failing safe (halt):",
              err
            );
            try {
              await db.batchRun.update({
                where: { id: batchId },
                data: { halted: true, haltReason: "ledger_write_failed" },
              });
            } catch (dbErr) {
              console.error(
                "[AgentWorker] fail-safe DB halt write failed:",
                dbErr
              );
            }
            try {
              await publisher.set(
                `batch:${batchId}:halted`,
                "1",
                "EX",
                REDIS_TTL_SECONDS
              );
            } catch {
              // Best-effort — the durable DB halt above is the guarantee.
            }
          }
        }

        await db.agentSession.update({
          where: { id: sessionId },
          data: {
            // A user cancel must stay "failed" (set by the cancel route) —
            // never let the post-abort completion overwrite it.
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

        // Create usage record. Z8: gated on `firstFinalize` so a stalled/retried
        // batch child (whose spend was already recorded on a prior attempt) does
        // NOT write a second UsageRecord and inflate the writer's usage. Always
        // true for non-batch sessions — their billing path is unchanged.
        if (firstFinalize) {
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
        }

        // Persist a SessionBrief when the session ended early (budget/time)
        // so the next session — e.g. "Continue where it left off" — sees
        // what was done and what remains (prompt-assembler injects briefs).
        const endReason = result.endReason ?? "natural";
        if (endReason === "budget" || endReason === "timeout") {
          const budgetLabel =
            validatedCostLimit != null
              ? ` ($${validatedCostLimit.toFixed(2)})`
              : "";
          await createSessionBrief(
            sessionId,
            bookId,
            userId,
            workflowId,
            "writing-coach",
            chapterNumber,
            {
              summary:
                result.wrapUpSummary ??
                (endReason === "budget"
                  ? `Session ended at the budget limit${budgetLabel}. Work may be incomplete.`
                  : "Session ended at the time limit. Work may be incomplete."),
              nextSteps: suggestedNext,
            }
          );
        }

        // Cancelled: the cancel route already published the terminal 'error'
        // SSE and set the Redis status to "failed" — publishing 'complete' /
        // overwriting the status key here would resurrect the session as
        // "completed" for replaying and polling clients.
        if (result.cancelled) return;

        // Failed (D-36): the orchestrator loop already published the terminal
        // SSE 'error' — same contract as cancel: publishing 'complete' or
        // setting the status key to "completed" here would resurrect a
        // provider-failed session as a clean run for replaying and polling
        // clients (and the morning batch digest would count it clean).
        if (!result.success) {
          await publisher.set(
            `session:${sessionId}:status`,
            "failed",
            "EX",
            REDIS_TTL_SECONDS
          );
          return;
        }

        // Publish completion message.
        // endReason/wrapUpSummary are TOP-LEVEL (not nested under resultMeta —
        // this publish flattens resultMeta and the client reads them top-level).
        await publishMessage({
          type: "complete",
          content: result.success
            ? "Session completed successfully"
            : "Session completed with errors",
          metadata: {
            ...resultMeta,
            // D-58: report the documents this run actually produced. The inline
            // SSE path spreads the whole result; this background path hand-picks
            // metadata, so documentIds must be threaded through explicitly or a
            // setup/onboarding completion lies with [] despite writing docs.
            documentIds: result.documentIds ?? [],
            suggestedNext,
            tokensInput: totalInput,
            tokensOutput: totalOutput,
            costUsd: cost,
            endReason,
            ...(result.wrapUpSummary
              ? { wrapUpSummary: result.wrapUpSummary }
              : {}),
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

    // Persist the initial user message so the first turn is part of the
    // rehydratable history for later /message continuations (fire-safe).
    if (message) {
      await addUserMessage(sessionId, message);
    }

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
    // Batch circuit breaker: a provider 429/auth/quota failure on a batch child
    // counts against the batch. Crossing the consecutive/total threshold trips
    // `halted`, so the pre-child guard skips remaining children instead of
    // letting each of N children burn its 3 BullMQ retries against a dead
    // provider. Runs BEFORE the re-throw so BullMQ still retries THIS job.
    if (batchId && isBatchBreakerError(err)) {
      await recordBatchFailure(publisher, batchId);
    }
    // Pre-orchestrator throws (no API key ~L296, coach model not found ~L279,
    // book not found ~L317) happen BEFORE the orchestrator's onError is wired,
    // so nothing marks the session terminal — it stays 'queued' and the digest
    // under-reports failedCount (M4). Best-effort flip only a still-non-terminal
    // row to 'failed' (updateMany with a status filter → idempotent + race-safe:
    // never clobbers a 'completed'/'skipped'/'failed'/cancel-owned row, and a
    // later successful retry's onComplete still overwrites it to 'completed').
    // Guarded so it can never mask the original error being re-thrown below.
    try {
      await db.agentSession.updateMany({
        where: { id: sessionId, status: { in: ["queued", "running"] } },
        data: { status: "failed", completedAt: new Date() },
      });
    } catch (statusErr) {
      console.error(
        "[AgentWorker] failed to mark non-terminal session failed:",
        statusErr
      );
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
  // Write pending approval state to Redis (session-bound — see M1 note on
  // ApprovalState; the approve route refuses foreign sessions)
  await publisher.set(
    `approval:${approvalId}`,
    JSON.stringify({ status: "pending", sessionId } as ApprovalState),
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
