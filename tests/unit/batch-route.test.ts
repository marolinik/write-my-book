import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  checkQuota: vi.fn(),
  resolveBatchModels: vi.fn(),
  enqueueBatchFlow: vi.fn(),
  redis: { set: vi.fn(), get: vi.fn() },
  getJob: vi.fn(),
  jobRemove: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    batchRun: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    agentSession: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: () => h.checkQuota() }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: () => "sk-x" }));
vi.mock("@/lib/llm", () => ({
  estimateWorkflowCost: () => ({ min: 1, max: 2, formatted: "$1-$2" }),
}));
vi.mock("@/lib/batch/resolve-batch-models", () => ({
  resolveBatchModels: (...a: unknown[]) => h.resolveBatchModels(...a),
}));
vi.mock("@/lib/queue/batch-flow", () => ({
  enqueueBatchFlow: (...a: unknown[]) => h.enqueueBatchFlow(...a),
  BATCH_DIGEST_QUEUE_NAME: "batch-digest",
}));
vi.mock("@/lib/queue/connection", () => ({ getAppConnection: () => h.redis }));
vi.mock("bullmq", () => ({
  Queue: class {
    getJob(...a: unknown[]) {
      return h.getJob(...a);
    }
  },
}));

import { POST as createBatch, GET as listBatches } from "@/app/api/books/[id]/batch/route";
import { GET as batchStatus } from "@/app/api/books/[id]/batch/[batchId]/route";
import { POST as cancelBatch } from "@/app/api/books/[id]/batch/[batchId]/cancel/route";

const bookCtx = { params: Promise.resolve({ id: "b1" }) };
const batchCtx = { params: Promise.resolve({ id: "b1", batchId: "batch1" }) };

function req(body: unknown) {
  return new Request("http://t/api/books/b1/batch", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.checkQuota.mockResolvedValue({ allowed: true });
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    userId: "u1",
    name: "The Salt Letters",
    language: "en",
    settings: null,
  });
  h.db.chapter.findMany.mockResolvedValue([
    { chapterNumber: 1 },
    { chapterNumber: 2 },
  ]);
  h.db.user.findUnique.mockResolvedValue({
    defaultModel: "anthropic/sonnet",
    modelGhostwriter: null,
    modelEditor: null,
    modelBetaReader: null,
    modelAnalyst: null,
    modelCoach: null,
    modelCreative: null,
  });
  h.db.apiKey.findMany.mockResolvedValue([]);
  // Default: no child rows. Every live-derivation path (list, poll, cancel)
  // reads them, so a test that does not care about children still gets a valid
  // empty array instead of `undefined`. Per-test `mockResolvedValueOnce` wins.
  h.db.agentSession.findMany.mockResolvedValue([]);
  h.resolveBatchModels.mockReturnValue({
    ok: true,
    coachRegistryId: "anthropic/sonnet",
    coachModelId: "claude-sonnet",
    providerKey: "anthropic",
  });
  h.enqueueBatchFlow.mockResolvedValue({
    batchId: "batch1",
    childCount: 2,
    scheduledFor: null,
  });
});

describe("POST /api/books/:id/batch — create", () => {
  it("401 when unauthorized", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(res.status).toBe(401);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("404 when book is not owned (ownership fence)", async () => {
    h.db.book.findFirst.mockResolvedValueOnce(null);
    const res = await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(res.status).toBe(404);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("D-56: non-owned book with an invalid body returns 404, not 400 (existence-hiding)", async () => {
    // Ownership/existence must be decided BEFORE body validation so a probe
    // cannot distinguish "not yours / doesn't exist" (404) from "bad body"
    // (400) on a resource it has no rights to.
    h.db.book.findFirst.mockResolvedValueOnce(null);
    const res = await createBatch(req({ workflowIds: [] }) as never, bookCtx as never);
    expect(res.status).toBe(404);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("rejects a prose-mutating workflow (revise) with 400", async () => {
    const res = await createBatch(
      req({ workflowIds: ["dev-edit", "revise"] }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("revise"),
    });
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("rejects write-chapter (prose mutation) with 400", async () => {
    const res = await createBatch(
      req({ workflowIds: ["write-chapter"] }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(400);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("rejects a conversational workflow (discuss-edits) with 400", async () => {
    const res = await createBatch(
      req({ workflowIds: ["discuss-edits"] }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(400);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("rejects a cap above the hard max ($25) with 400", async () => {
    const res = await createBatch(
      req({ workflowIds: ["dev-edit"], budgetCapUsd: 30 }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("25"),
    });
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("rejects a non-positive cap (0) with 400", async () => {
    const res = await createBatch(
      req({ workflowIds: ["dev-edit"], budgetCapUsd: 0 }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(400);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  // D-110: batch is a PLAN wall, not a rate limit. A plan/quota denial must
  // answer 403 with the same {error, upgradeToTier} envelope as the sibling plan
  // gates (series, books, analytics) — never a 429 that falsely signals throttling.
  it("D-110: plan-gate denial returns 403 with the upgrade envelope (not 429)", async () => {
    h.checkQuota.mockResolvedValueOnce({
      allowed: false,
      reason: "Overnight batches are a paid feature.",
      upgradeToTier: "indie",
    });
    const res = await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: "Overnight batches are a paid feature.",
      upgradeToTier: "indie",
    });
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("happy path: expands (workflow × chapters) and calls enqueueBatchFlow", async () => {
    const res = await createBatch(
      req({ workflowIds: ["dev-edit"], chapterStart: 1, chapterEnd: 2, budgetCapUsd: 8 }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      batchId: "batch1",
      childCount: 2,
      scheduledFor: null,
    });
    expect(h.enqueueBatchFlow).toHaveBeenCalledTimes(1);
    const arg = h.enqueueBatchFlow.mock.calls[0][0];
    expect(arg.budgetCapUsd).toBe(8);
    expect(arg.userId).toBe("u1");
    expect(arg.children).toHaveLength(2); // dev-edit × 2 chapters
    expect(arg.children.every((c: { chapterNumber?: number }) => c.chapterNumber != null)).toBe(true);
  });

  it("defaults the cap to $10 when omitted", async () => {
    await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(h.enqueueBatchFlow.mock.calls[0][0].budgetCapUsd).toBe(10);
  });

  it("non-chapter workflow (analyze) expands to a single manuscript-wide child", async () => {
    const res = await createBatch(
      req({ workflowIds: ["analyze"] }) as never,
      bookCtx as never
    );
    expect(res.status).toBe(201);
    const arg = h.enqueueBatchFlow.mock.calls[0][0];
    expect(arg.children).toHaveLength(1);
    expect(arg.children[0].chapterNumber).toBeUndefined();
  });

  it("400 when a chapter-scoped batch has no chapters in range", async () => {
    h.db.chapter.findMany.mockResolvedValueOnce([]);
    const res = await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(res.status).toBe(400);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("propagates a model-resolution failure code (400 no key)", async () => {
    h.resolveBatchModels.mockReturnValueOnce({
      ok: false,
      code: 400,
      error: "No Anthropic API key configured.",
    });
    const res = await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(res.status).toBe(400);
    expect(h.enqueueBatchFlow).not.toHaveBeenCalled();
  });

  it("schedules for a future instant when scheduleMode is 'tonight'", async () => {
    await createBatch(
      req({ workflowIds: ["dev-edit"], scheduleMode: "tonight" }) as never,
      bookCtx as never
    );
    const arg = h.enqueueBatchFlow.mock.calls[0][0];
    expect(arg.scheduledFor).toBeInstanceOf(Date);
    expect(arg.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("GET /api/books/:id/batch — list", () => {
  it("404 when book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValueOnce(null);
    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    expect(res.status).toBe(404);
  });

  it("returns the book's batches", async () => {
    h.db.book.findFirst.mockResolvedValueOnce({ id: "b1" });
    // A genuinely-queued batch with no dispatched child stays queued/$0 — the
    // live derivation must not INVENT progress either.
    h.db.batchRun.findMany.mockResolvedValueOnce([
      {
        id: "batch1",
        status: "queued",
        spentUsd: 0,
        halted: false,
        startedAt: null,
        completedAt: null,
        completedCount: 0,
        failedCount: 0,
      },
    ]);
    h.db.agentSession.findMany.mockResolvedValueOnce([]);
    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      batches: [
        {
          id: "batch1",
          status: "queued",
          spentUsd: 0,
          halted: false,
          startedAt: null,
          completedAt: null,
          completedCount: 0,
          failedCount: 0,
        },
      ],
    });
    expect(h.db.batchRun.findMany.mock.calls[0][0].where).toEqual({
      bookId: "b1",
      userId: "u1",
    });
  });

  // ── D-120 (D-96 sibling) ────────────────────────────────────────────────
  // The single-batch poll route derives an honest live view from the child
  // rows (D-96), but the LIST route served the raw BatchRun row — so the same
  // mid-run batch read "queued / $0.00" here while the detail route already
  // said "running / $0.0446". A list-consuming surface must tell the SAME
  // truth.
  it("D-120: derives honest live status/spend/halted/startedAt per non-terminal row", async () => {
    const started = new Date("2026-07-21T02:00:00Z");
    h.db.book.findFirst.mockResolvedValueOnce({ id: "b1" });
    h.db.batchRun.findMany.mockResolvedValueOnce([
      {
        id: "batch1",
        status: "queued", // stored columns lag until the digest fans in
        spentUsd: 0,
        halted: false,
        startedAt: null,
        completedAt: null,
      },
    ]);
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { batchId: "batch1", status: "completed", actualCostUsd: 0.0446, startedAt: started },
      {
        batchId: "batch1",
        status: "running",
        actualCostUsd: null,
        startedAt: new Date("2026-07-21T02:05:00Z"),
      },
      { batchId: "batch1", status: "queued", actualCostUsd: null, startedAt: null },
    ]);
    // A mid-run budget-cap halt lives ONLY in Redis until the digest runs.
    h.redis.get.mockResolvedValueOnce("1");

    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0].status).toBe("running");
    expect(body.batches[0].spentUsd).toBeCloseTo(0.0446, 6);
    expect(body.batches[0].halted).toBe(true);
    expect(body.batches[0].startedAt).toBe(started.toISOString());
    // Child rows are fetched ONLY for the non-terminal batches.
    expect(h.db.agentSession.findMany.mock.calls[0][0].where).toEqual({
      batchId: { in: ["batch1"] },
    });
  });

  it("D-120: terminal rows are returned verbatim — the digest is the source of truth", async () => {
    h.db.book.findFirst.mockResolvedValueOnce({ id: "b1" });
    h.db.batchRun.findMany.mockResolvedValueOnce([
      {
        id: "done1",
        status: "done",
        spentUsd: 6,
        halted: false,
        startedAt: new Date("2026-07-21T02:00:00Z"),
        completedAt: new Date("2026-07-21T03:00:00Z"),
      },
      {
        // A cancelled batch keeps its reconciled row too.
        id: "cancelled1",
        status: "cancelled",
        spentUsd: 1.5,
        halted: true,
        startedAt: null,
        completedAt: null,
      },
    ]);

    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches[0]).toMatchObject({ status: "done", spentUsd: 6, halted: false });
    expect(body.batches[1]).toMatchObject({
      status: "cancelled",
      spentUsd: 1.5,
      halted: true,
    });
    // No child query and no Redis consult when every row is already terminal.
    expect(h.db.agentSession.findMany).not.toHaveBeenCalled();
    expect(h.redis.get).not.toHaveBeenCalled();
  });

  it("D-120: a stored digest marks a row terminal even if status still reads 'running'", async () => {
    h.db.book.findFirst.mockResolvedValueOnce({ id: "b1" });
    h.db.batchRun.findMany.mockResolvedValueOnce([
      {
        id: "batch1",
        status: "running",
        spentUsd: 8.25,
        halted: false,
        startedAt: new Date("2026-07-21T02:00:00Z"),
        // completedAt is written atomically with the digest + terminal status.
        completedAt: new Date("2026-07-21T03:00:00Z"),
      },
    ]);

    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    const body = await res.json();
    expect(body.batches[0].spentUsd).toBeCloseTo(8.25, 5);
    expect(h.db.agentSession.findMany).not.toHaveBeenCalled();
  });

  // ── D-186b (LIST progress counts) ───────────────────────────────────────
  // `completedCount` / `failedCount` are ALSO only written by the fan-in
  // digest, so a mid-run list row reported "0 done" next to the (now honest)
  // live status/spend — the same stale-column lie D-120 fixed, one field pair
  // further along. They belong in the SAME derivation.
  it("D-186: derives live completed/failed counts for a non-terminal row", async () => {
    h.db.book.findFirst.mockResolvedValueOnce({ id: "b1" });
    h.db.batchRun.findMany.mockResolvedValueOnce([
      {
        id: "batch1",
        status: "queued",
        spentUsd: 0,
        halted: false,
        startedAt: null,
        completedAt: null,
        completedCount: 0, // stored counts lag until the digest fans in
        failedCount: 0,
      },
    ]);
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { batchId: "batch1", status: "completed", actualCostUsd: 1, startedAt: new Date() },
      { batchId: "batch1", status: "completed", actualCostUsd: 1, startedAt: new Date() },
      { batchId: "batch1", status: "failed", actualCostUsd: null, startedAt: new Date() },
      { batchId: "batch1", status: "skipped", actualCostUsd: null, startedAt: new Date() },
      { batchId: "batch1", status: "running", actualCostUsd: null, startedAt: new Date() },
    ]);

    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    const body = await res.json();
    expect(body.batches[0].completedCount).toBe(2);
    expect(body.batches[0].failedCount).toBe(1);
  });

  it("D-186: terminal rows keep their reconciled counts verbatim", async () => {
    h.db.book.findFirst.mockResolvedValueOnce({ id: "b1" });
    h.db.batchRun.findMany.mockResolvedValueOnce([
      {
        id: "done1",
        status: "done",
        spentUsd: 6,
        halted: false,
        startedAt: new Date("2026-07-21T02:00:00Z"),
        completedAt: new Date("2026-07-21T03:00:00Z"),
        completedCount: 3,
        failedCount: 1,
      },
    ]);

    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    const body = await res.json();
    expect(body.batches[0].completedCount).toBe(3);
    expect(body.batches[0].failedCount).toBe(1);
    expect(h.db.agentSession.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/books/:id/batch/:batchId — status", () => {
  it("404 when batch is not owned", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce(null);
    const res = await batchStatus(new Request("http://t") as never, batchCtx as never);
    expect(res.status).toBe(404);
  });

  it("returns batch + live child-status counts", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({ id: "batch1", status: "running" });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "completed" },
      { status: "skipped" },
      { status: "running" },
    ]);
    const res = await batchStatus(new Request("http://t") as never, batchCtx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toMatchObject({
      total: 3,
      completed: 1,
      skipped: 1,
      running: 1,
    });
  });

  it("D-96: live view derives honest spend/status/halted/startedAt from child rows (non-terminal)", async () => {
    const started = new Date("2026-07-20T02:00:00Z");
    // Stored BatchRun columns lag reality until the digest fans in.
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "queued",
      spentUsd: 0,
      halted: false,
      startedAt: null,
      digest: null,
    });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "completed", actualCostUsd: 1.25, startedAt: started },
      { status: "running", actualCostUsd: null, startedAt: new Date("2026-07-20T02:05:00Z") },
      { status: "queued", actualCostUsd: null, startedAt: null },
    ]);
    // A mid-run budget-cap halt lives ONLY in Redis until the digest runs.
    h.redis.get.mockResolvedValueOnce("1");

    const res = await batchStatus(new Request("http://t") as never, batchCtx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batch.status).toBe("running"); // a child is running/completed
    expect(body.batch.spentUsd).toBeCloseTo(1.25, 5); // sum of finalized child cost
    expect(body.batch.halted).toBe(true); // live Redis halt flag surfaced
    expect(body.batch.startedAt).not.toBeNull(); // earliest started child
    expect(body.counts).toMatchObject({ running: 1, completed: 1, queued: 1 });
  });

  it("D-96: a terminal batch is returned verbatim — the live view never contradicts the digest", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "done",
      spentUsd: 6,
      halted: false,
      startedAt: new Date("2026-07-20T02:00:00Z"),
      digest: { passes: { total: 2 } },
    });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "completed", actualCostUsd: 3, startedAt: new Date() },
      { status: "completed", actualCostUsd: 3, startedAt: new Date() },
    ]);
    const res = await batchStatus(new Request("http://t") as never, batchCtx as never);
    const body = await res.json();
    expect(body.batch.status).toBe("done"); // stored terminal status verbatim
    expect(body.batch.spentUsd).toBeCloseTo(6, 5);
    // Terminal truth wins → the live Redis halt flag is NOT consulted.
    expect(h.redis.get).not.toHaveBeenCalled();
  });

  it("D-186: the polled batch row carries live completed/failed counts mid-run", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "queued",
      spentUsd: 0,
      halted: false,
      startedAt: null,
      digest: null,
      completedCount: 0, // stale until the fan-in digest
      failedCount: 0,
    });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "completed", actualCostUsd: 1, startedAt: new Date() },
      { status: "failed", actualCostUsd: null, startedAt: new Date() },
      { status: "queued", actualCostUsd: null, startedAt: null },
    ]);

    const res = await batchStatus(new Request("http://t") as never, batchCtx as never);
    const body = await res.json();
    expect(body.batch.completedCount).toBe(1);
    expect(body.batch.failedCount).toBe(1);
    // The separate live `counts` block is unchanged.
    expect(body.counts).toMatchObject({ completed: 1, failed: 1, queued: 1 });
  });
});

describe("POST /api/books/:id/batch/:batchId/cancel", () => {
  it("404 when batch is not owned", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce(null);
    const res = await cancelBatch(new Request("http://t", { method: "POST" }) as never, batchCtx as never);
    expect(res.status).toBe(404);
  });

  it("idempotent no-op when already terminal", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({ id: "batch1", status: "done", parentJobId: null });
    const res = await cancelBatch(new Request("http://t", { method: "POST" }) as never, batchCtx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, alreadyDone: true });
    expect(h.db.batchRun.update).not.toHaveBeenCalled();
  });

  it("trips the halt flag, marks cancelled, and removes a delayed parent job", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "running",
      parentJobId: "p1",
    });
    h.getJob.mockResolvedValueOnce({
      getState: async () => "delayed",
      remove: h.jobRemove,
    });
    const res = await cancelBatch(new Request("http://t", { method: "POST" }) as never, batchCtx as never);
    expect(res.status).toBe(200);
    // Halt flag is TTL-bounded (M2) so a pre-run cancel can't leak the key.
    expect(h.redis.set).toHaveBeenCalledWith(
      "batch:batch1:halted",
      "1",
      "EX",
      expect.any(Number)
    );
    const upd = h.db.batchRun.update.mock.calls[0][0];
    expect(upd.data).toMatchObject({ status: "cancelled", halted: true, haltReason: "cancelled" });
    expect(h.jobRemove).toHaveBeenCalledTimes(1);
  });

  it("M1: does NOT remove a 'waiting-children' parent — the fan-in digest must still run", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "running",
      parentJobId: "p1",
    });
    // A scheduled batch's parent sits in 'waiting-children' (its delayed
    // children haven't resolved yet). Removing it would suppress the digest.
    h.getJob.mockResolvedValueOnce({
      getState: async () => "waiting-children",
      remove: h.jobRemove,
    });
    const res = await cancelBatch(new Request("http://t", { method: "POST" }) as never, batchCtx as never);
    expect(res.status).toBe(200);
    // Still trips the halt flag + marks cancelled — but leaves the parent alone.
    expect(h.db.batchRun.update).toHaveBeenCalledTimes(1);
    expect(h.jobRemove).not.toHaveBeenCalled();
  });

  // ── D-186a: the "$0.00 cancel" money lie ────────────────────────────────
  // Cancel flipped `status` to a TERMINAL value without touching the money
  // columns. Because terminal rows are served VERBATIM by the shared live view
  // (D-96/D-120 rule 1), a batch that had really spent money read "$0.00 /
  // 0 done" on BOTH routes from the cancel click until the fan-in digest
  // reconciled it — minutes to hours later, since in-flight children finish on
  // their own. The cancel is the LAST moment a live derivation is allowed, so
  // it must persist what it derives.
  it("D-186: cancelling mid-run persists the spend already incurred (no $0.00 cancel window)", async () => {
    const started = new Date("2026-07-27T02:00:00Z");
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "running",
      parentJobId: null,
      spentUsd: 0,
      halted: false,
      startedAt: null,
      completedAt: null,
      completedCount: 0,
      failedCount: 0,
    });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "completed", actualCostUsd: 0.0446, startedAt: started },
      { status: "failed", actualCostUsd: 0.01, startedAt: new Date("2026-07-27T02:05:00Z") },
      { status: "running", actualCostUsd: null, startedAt: new Date("2026-07-27T02:07:00Z") },
      { status: "queued", actualCostUsd: null, startedAt: null },
    ]);

    const res = await cancelBatch(
      new Request("http://t", { method: "POST" }) as never,
      batchCtx as never
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, spentUsd: 0.0546 });

    const data = h.db.batchRun.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "cancelled", halted: true, haltReason: "cancelled" });
    // Pre-fix: spentUsd absent from the update → stored $0.00 served verbatim.
    expect(data.spentUsd).toBeCloseTo(0.0546, 6);
    expect(data.completedCount).toBe(1);
    expect(data.failedCount).toBe(1);
    expect(data.startedAt).toEqual(started);
    // Children are read for THIS batch only, after the halt flag is tripped, so
    // the figure includes everything that had settled by then.
    expect(h.db.agentSession.findMany.mock.calls[0][0].where).toEqual({
      batchId: "batch1",
    });
    const setOrder = h.redis.set.mock.invocationCallOrder[0];
    const readOrder = h.db.agentSession.findMany.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(readOrder);
  });

  it("D-186: a cancel never regresses an already-reconciled spend (under-claim only)", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "running",
      parentJobId: null,
      spentUsd: 2.5, // already reconciled higher than the child rows show
      halted: false,
      startedAt: new Date("2026-07-27T02:00:00Z"),
      completedAt: null,
      completedCount: 4,
      failedCount: 0,
    });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "completed", actualCostUsd: 1, startedAt: new Date("2026-07-27T02:10:00Z") },
    ]);

    await cancelBatch(new Request("http://t", { method: "POST" }) as never, batchCtx as never);
    const data = h.db.batchRun.update.mock.calls[0][0].data;
    expect(data.spentUsd).toBeCloseTo(2.5, 6);
    expect(data.completedCount).toBe(4); // stored counts never regress either
    expect(data.startedAt).toEqual(new Date("2026-07-27T02:00:00Z"));
  });

  it("D-186: cancelling before any child ran invents no spend", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "queued",
      parentJobId: null,
      spentUsd: 0,
      halted: false,
      startedAt: null,
      completedAt: null,
      completedCount: 0,
      failedCount: 0,
    });
    h.db.agentSession.findMany.mockResolvedValueOnce([
      { status: "queued", actualCostUsd: null, startedAt: null },
      { status: "queued", actualCostUsd: null, startedAt: null },
    ]);

    await cancelBatch(new Request("http://t", { method: "POST" }) as never, batchCtx as never);
    const data = h.db.batchRun.update.mock.calls[0][0].data;
    expect(data.spentUsd).toBe(0);
    expect(data.startedAt).toBeNull();
    expect(data.completedCount).toBe(0);
  });

  it("D-186: a failed child read still cancels, degrading to the stored money state", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "running",
      parentJobId: null,
      spentUsd: 1.75,
      halted: false,
      startedAt: null,
      completedAt: null,
      completedCount: 1,
      failedCount: 0,
    });
    h.db.agentSession.findMany.mockRejectedValueOnce(new Error("db down"));

    const res = await cancelBatch(
      new Request("http://t", { method: "POST" }) as never,
      batchCtx as never
    );
    // Stopping the spend + flipping the status are the load-bearing halves —
    // the honesty write must never be able to block them.
    expect(res.status).toBe(200);
    expect(h.redis.set).toHaveBeenCalled();
    const data = h.db.batchRun.update.mock.calls[0][0].data;
    expect(data.status).toBe("cancelled");
    expect(data.spentUsd).toBeCloseTo(1.75, 6); // stored value, never regressed
    expect(data.completedCount).toBe(1);
  });

  // ── D-186c: one terminal set, no drift ──────────────────────────────────
  // The cancel route kept its own TERMINAL_STATUSES (done|failed|cancelled)
  // while the shared live view used TERMINAL_BATCH_STATUSES (which also holds
  // 'halted'). A halted batch is written by the digest — already terminal — so
  // cancel must treat it as the same no-op both sets agree on everywhere else.
  it("D-186c: cancel of a 'halted' batch is an idempotent no-op (shared terminal set)", async () => {
    h.db.batchRun.findFirst.mockResolvedValueOnce({
      id: "batch1",
      status: "halted",
      parentJobId: "p1",
      spentUsd: 9.99,
      halted: true,
      startedAt: null,
      completedAt: new Date(),
      completedCount: 2,
      failedCount: 0,
    });
    const res = await cancelBatch(
      new Request("http://t", { method: "POST" }) as never,
      batchCtx as never
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, alreadyDone: true });
    // No spend rewrite, no halt-flag churn, no parent-job surgery.
    expect(h.db.batchRun.update).not.toHaveBeenCalled();
    expect(h.redis.set).not.toHaveBeenCalled();
    expect(h.getJob).not.toHaveBeenCalled();
  });
});
