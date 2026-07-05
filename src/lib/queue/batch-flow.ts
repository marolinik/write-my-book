/**
 * BullMQ FlowProducer fan-out for overnight/batch editorial runs.
 *
 * A batch expands `(workflowIds × chapters)` into N background agent jobs on the
 * EXISTING `agent-sessions` queue (each an unchanged `AgentJobData` picked up by
 * the unchanged `processAgentJob`), plus ONE fan-in parent job on the NEW
 * `batch-digest` queue. BullMQ resolves the parent only once every child is
 * terminal — that parent is the morning-digest job (BATCH-SPEC §3).
 *
 * This is the one distinct enqueue path (BATCH-SPEC §3.3): today's
 * `enqueueAgentJob` calls `queue.add` with NO parent linkage, so batch children
 * cannot go through it as-is. The AgentJobData PAYLOAD is reused verbatim; only
 * the ADD mechanism (FlowProducer, with parent linkage) is new.
 */

import { FlowProducer } from "bullmq";
import type { FlowChildJob } from "bullmq";
import { randomUUID } from "crypto";
import { getAppConnection } from "./connection";
import { QUEUE_NAME, type AgentJobData } from "./agent-queue";
import { db } from "@/lib/db";

/** The new queue the fan-in digest/parent job lives on. */
export const BATCH_DIGEST_QUEUE_NAME = "batch-digest";

/** Serializable payload for the fan-in digest (parent) job. */
export interface BatchDigestJobData {
  /** The BatchRun id whose children this digest rolls up. */
  batchId: string;
}

/**
 * A single expanded child pass. The caller (the batch API) builds the full
 * `AgentJobData` exactly as `route.ts` does per pass, MINUS the three fields
 * this helper owns: `sessionId` (created here as the AgentSession row id),
 * `batchId` (the BatchRun id created here), and `batchBudgetCapUsd` (the one
 * aggregate cap, applied to every child).
 */
export type BatchChildPayload = Omit<
  AgentJobData,
  "sessionId" | "batchId" | "batchBudgetCapUsd"
>;

export interface EnqueueBatchFlowParams {
  userId: string;
  bookId: string;
  /** The eligible editorial workflows requested (validated by the caller). */
  workflowIds: string[];
  chapterStart: number;
  chapterEnd: number;
  /**
   * Aggregate dollar ceiling across ALL children. MUST be finite — Infinity does
   * not survive BullMQ JSON serialization (becomes null → effectively uncapped).
   */
  budgetCapUsd: number;
  /** Absolute instant to release the parent job; null/undefined => run now. */
  scheduledFor?: Date | null;
  /** Pre-built `(workflows × chapters)` child payloads. */
  children: BatchChildPayload[];
}

export interface EnqueueBatchFlowResult {
  batchId: string;
  childCount: number;
  scheduledFor: Date | null;
  parentJobId: string | null;
}

/**
 * Child job options. FlowProducer does NOT inherit the Queue instance's
 * `defaultJobOptions`, so the per-child resilience the standard path gets for
 * free (`agent-queue.ts:59-73`) must be restated here to match: 3 attempts with
 * exponential backoff, and bounded completed/failed retention.
 *
 * `ignoreDependencyOnFailure: true` is load-bearing (BATCH-SPEC §2.1 "failed /
 * cancelled / halted / done all still run the digest"): a child that exhausts
 * its `attempts` and ends BullMQ-'failed' (e.g. an API key that expired between
 * evening scheduling and 2am execution → every child fails; also "Book not
 * found", or a SessionCancelledError → UnrecoverableError) would otherwise stay
 * in the parent's dependency set FOREVER, so the digest parent never resolves —
 * no morning report, orphaned Redis ledger keys. With this flag a failed child
 * is dropped from the dependency set and the fan-in digest still fires. The
 * digest reads child OUTCOMES from the DB (AgentSession/EditFinding/Chapter),
 * NOT `getChildrenValues`, so proceeding-on-failure yields exactly the intended
 * partial morning report.
 */
const CHILD_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  ignoreDependencyOnFailure: true,
};

/** Lazy module-level FlowProducer reusing the shared app connection. */
let flowProducer: FlowProducer | null = null;
function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({ connection: getAppConnection() });
  }
  return flowProducer;
}

/**
 * Create the `BatchRun` + child `AgentSession` rows (status `queued`) and enqueue
 * the FlowProducer fan-out. Children run on `agent-sessions` (dedup jobId =
 * sessionId, as today) and carry the optional one-shot `delay` (e.g. "Tonight
 * 2am"); the parent digest job waits on `batch-digest` as a pure fan-in (delay 0)
 * and fires only after every child has resolved.
 *
 * @throws if `budgetCapUsd` is non-finite or `children` is empty — these are
 * caller bugs that would otherwise run a batch effectively uncapped or empty.
 */
export async function enqueueBatchFlow(
  params: EnqueueBatchFlowParams
): Promise<EnqueueBatchFlowResult> {
  const {
    userId,
    bookId,
    workflowIds,
    chapterStart,
    chapterEnd,
    budgetCapUsd,
    scheduledFor,
    children,
  } = params;

  if (!Number.isFinite(budgetCapUsd) || budgetCapUsd <= 0) {
    throw new Error(
      `enqueueBatchFlow: budgetCapUsd must be a positive finite number (got ${budgetCapUsd})`
    );
  }
  if (children.length === 0) {
    throw new Error("enqueueBatchFlow: no children to enqueue");
  }

  // One-shot delay: the CHILDREN carry the delay so the editorial passes (and
  // their spend) are actually deferred until `scheduledFor`. A FlowProducer
  // PARENT does NOT gate its children — the parent only runs AFTER all children
  // resolve — so a delay on the parent would be inoperative (children would fan
  // out and SPEND immediately at creation). The parent digest is a pure fan-in
  // (delay 0). `scheduledFor` is an absolute instant (UTC), never a wall-clock
  // string (BATCH-SPEC §3.4 timezone note).
  const delay = scheduledFor
    ? Math.max(0, scheduledFor.getTime() - Date.now())
    : 0;

  // ── Create the BatchRun row (before enqueue) ───────────────────────
  const batch = await db.batchRun.create({
    data: {
      userId,
      bookId,
      workflowIds,
      chapterStart,
      chapterEnd,
      budgetCapUsd,
      scheduledFor: scheduledFor ?? null,
      status: "queued",
      childCount: children.length,
    },
  });

  // ── Pre-generate child session ids so the AgentSession row id and the
  //    BullMQ jobId are the SAME value (the dedup pattern), and the child
  //    AgentJobData can reference its own sessionId without a second write.
  const withIds = children.map((payload) => ({
    sessionId: randomUUID(),
    payload,
  }));

  // ── Create child AgentSession rows (status 'queued', linked to batch) ──
  await db.agentSession.createMany({
    data: withIds.map(({ sessionId, payload }) => ({
      id: sessionId,
      bookId: payload.bookId,
      userId: payload.userId,
      agentType: payload.agentType,
      workflowId: payload.workflowId,
      chapterNumber: payload.chapterNumber ?? null,
      status: "queued",
      batchId: batch.id,
      jobId: sessionId,
    })),
  });

  // ── Build the flow children (existing queue, dedup jobId) ──────────
  const flowChildren: FlowChildJob[] = withIds.map(
    ({ sessionId, payload }) => ({
      queueName: QUEUE_NAME,
      name: "agent-session",
      data: {
        ...payload,
        sessionId,
        batchId: batch.id,
        batchBudgetCapUsd: budgetCapUsd,
      } satisfies AgentJobData,
      opts: {
        jobId: sessionId,
        // The one-shot schedule delay lives on EACH CHILD (see `delay` above):
        // this is what actually defers the batch's editorial passes + spend
        // until `scheduledFor`. Omitted entirely when running now (delay 0).
        ...(delay > 0 ? { delay } : {}),
        ...CHILD_JOB_OPTIONS,
      },
    })
  );

  // ── Enqueue: parent digest on the NEW queue, children on the existing ──
  const flow = await getFlowProducer().add({
    queueName: BATCH_DIGEST_QUEUE_NAME,
    name: "digest",
    data: { batchId: batch.id } satisfies BatchDigestJobData,
    opts: {
      // Pure fan-in: the parent carries NO schedule delay (that lives on the
      // children). BullMQ releases this job only after every child resolves, so
      // it fires when the batch's work is done — whether that's now or after the
      // children's scheduled delay elapses (BATCH-SPEC §3.4).
      delay: 0,
      // The digest processor is defensively wrapped and never throws, so a
      // single attempt is correct — a failed digest writes a failed-status row
      // rather than retrying (BATCH-SPEC §3.5).
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
    children: flowChildren,
  });

  const parentJobId = flow.job.id ?? null;

  // Record the parent job id for cancel/inspect (BATCH-SPEC §2.1).
  if (parentJobId) {
    await db.batchRun.update({
      where: { id: batch.id },
      data: { parentJobId },
    });
  }

  return {
    batchId: batch.id,
    childCount: children.length,
    scheduledFor: scheduledFor ?? null,
    parentJobId,
  };
}
