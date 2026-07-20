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

  it("returns 429 when the usage quota is exhausted", async () => {
    h.checkQuota.mockResolvedValueOnce({ allowed: false, reason: "Quota exceeded" });
    const res = await createBatch(req({ workflowIds: ["dev-edit"] }) as never, bookCtx as never);
    expect(res.status).toBe(429);
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
    h.db.batchRun.findMany.mockResolvedValueOnce([{ id: "batch1", status: "queued" }]);
    const res = await listBatches(new Request("http://t") as never, bookCtx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      batches: [{ id: "batch1", status: "queued" }],
    });
    expect(h.db.batchRun.findMany.mock.calls[0][0].where).toEqual({
      bookId: "b1",
      userId: "u1",
    });
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
});
