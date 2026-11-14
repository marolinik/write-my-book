// Wave 7 / D22 (P2-76): exports are jobs on the worker. The route enqueues
// (202 + job id) under a per-writer Redis slot, the worker converts, and the
// client polls a status route that only the job's owner can read.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  // A tiny Redis: enough for SET NX EX, DEL and the two compare-and-act scripts.
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const redis = {
    store,
    ttls,
    set: vi.fn(async (key: string, value: string, _ex: string, ttl: number, nx: string) => {
      if (nx === "NX" && store.has(key)) return null;
      store.set(key, value);
      ttls.set(key, ttl);
      return "OK";
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    eval: vi.fn(async (script: string, _n: number, key: string, owner: string, ttl?: number) => {
      if (store.get(key) !== owner) return 0;
      if (script.includes("expire")) {
        ttls.set(key, Number(ttl));
        return 1;
      }
      store.delete(key);
      return 1;
    }),
  };
  return {
    redis,
  queue: { add: vi.fn(), getJob: vi.fn() },
  db: { book: { findFirst: vi.fn() }, series: { findFirst: vi.fn() } },
  run: { book: vi.fn(), series: vi.fn() },
  };
});

vi.mock("@/lib/import-export/run-export", () => ({
  runBookExport: h.run.book,
  runSeriesExport: h.run.series,
}));

vi.mock("@/lib/queue/connection", () => ({ getAppConnection: () => h.redis }));
vi.mock("bullmq", () => ({
  Queue: class {
    add = h.queue.add;
    getJob = h.queue.getJob;
  },
  UnrecoverableError: class extends Error {
    name = "UnrecoverableError";
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import {
  enqueueExport,
  readOwnExportJob,
  releaseExportSlot,
  EXPORT_SLOT_QUEUED_TTL_SECONDS,
  EXPORT_SLOT_RUNNING_TTL_SECONDS,
} from "@/lib/queue/export-queue";
import { POST as postBookExport } from "@/app/api/books/[id]/export/route";
import { GET as bookJobStatus } from "@/app/api/books/[id]/export/jobs/[jobId]/route";
import { awaitExportJob, EXPORT_POLL_TIMEOUT_MS } from "@/lib/import-export/await-export-job";
import { processExportJob } from "@/lib/queue/export-worker";

const B = "00000000-0000-4000-8000-0000000000bb";
const DATA = { kind: "book" as const, userId: "u1", targetId: B, request: { format: "epub" as const } };

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.store.clear();
  h.redis.ttls.clear();
  h.queue.add.mockImplementation(async (_name: string, _data: unknown, opts: { jobId: string }) => ({ id: opts.jobId }));
  h.db.book.findFirst.mockResolvedValue({ id: B, userId: "u1" });
});

describe("enqueueExport", () => {
  it("takes the writer's slot with the job's own id, and the id is not guessable", async () => {
    const queued = await enqueueExport(DATA);
    expect(queued?.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(h.redis.store.get("export:running:u1")).toBe(queued?.jobId);
    expect(h.queue.add).toHaveBeenCalledWith("export", DATA, { jobId: queued?.jobId });
  });

  it("refuses while the writer already has an export queued or running", async () => {
    await enqueueExport(DATA);
    h.queue.add.mockClear();
    expect(await enqueueExport(DATA)).toBeNull();
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it("frees its own slot when the enqueue itself fails", async () => {
    h.queue.add.mockRejectedValue(new Error("redis gone"));
    await expect(enqueueExport(DATA)).rejects.toThrow("redis gone");
    expect(h.redis.store.has("export:running:u1")).toBe(false);
  });

  it("the slot waits in the queue longer than a run may take (Wave 7 review)", async () => {
    await enqueueExport(DATA);
    expect(h.redis.ttls.get("export:running:u1")).toBe(EXPORT_SLOT_QUEUED_TTL_SECONDS);
    expect(EXPORT_SLOT_QUEUED_TTL_SECONDS).toBeGreaterThan(EXPORT_SLOT_RUNNING_TTL_SECONDS);
  });

  it("a stale job cannot free a newer job's slot", async () => {
    h.redis.store.set("export:running:u1", "job-B");
    await releaseExportSlot("u1", "job-A");
    expect(h.redis.store.get("export:running:u1")).toBe("job-B");
    await releaseExportSlot("u1", "job-B");
    expect(h.redis.store.has("export:running:u1")).toBe(false);
  });
});

describe("POST /api/books/:id/export", () => {
  const post = () =>
    postBookExport(
      new NextRequest(`http://t/api/books/${B}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "epub" }),
      }),
      { params: Promise.resolve({ id: B }) }
    );

  it("answers 202 with the job id and converts nothing itself", async () => {
    const res = await post();
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ jobId: expect.any(String), status: "queued" });
    expect(body.jobId).toBe(h.redis.store.get("export:running:u1"));
  });

  it("answers 429 RATE_LIMITED while the writer's export runs", async () => {
    h.redis.store.set("export:running:u1", "job-running");
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });
});

describe("processExportJob (worker)", () => {
  const RESULT = { filename: "book.epub", format: "epub", warnings: [] };

  it("runs the book export, returns its result and frees the writer's slot", async () => {
    h.run.book.mockResolvedValue(RESULT);
    h.redis.store.set("export:running:u1", "j1");
    expect(await processExportJob({ id: "j1", data: DATA } as never)).toEqual(RESULT);
    expect(h.run.book).toHaveBeenCalledWith("u1", B, { format: "epub" });
    expect(h.run.series).not.toHaveBeenCalled();
    expect(h.redis.store.has("export:running:u1")).toBe(false);
  });

  it("routes a series job to the omnibus export", async () => {
    h.run.series.mockResolvedValue(RESULT);
    await processExportJob({ id: "j2", data: { ...DATA, kind: "series", targetId: "s1" } } as never);
    expect(h.run.series).toHaveBeenCalledWith("u1", "s1", { format: "epub" });
    expect(h.run.book).not.toHaveBeenCalled();
  });

  it("a non-conversion failure reports EXPORT_FAILED, no internal text, and still frees the slot", async () => {
    h.run.book.mockRejectedValue(new Error("connect ECONNREFUSED minio:9000"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.redis.store.set("export:running:u1", "j3");
    const failure = (await processExportJob({ id: "j3", data: DATA } as never).catch((e: unknown) => e)) as Error;
    expect(failure.message).toBe("EXPORT_FAILED");
    expect(h.redis.store.has("export:running:u1")).toBe(false);
  });

  it("a running job shortens its slot to the run's own limit (Wave 7 review)", async () => {
    let ttlDuringRun: number | undefined;
    h.run.book.mockImplementation(async () => {
      ttlDuringRun = h.redis.ttls.get("export:running:u1");
      return RESULT;
    });
    h.redis.store.set("export:running:u1", "j4");
    await processExportJob({ id: "j4", data: DATA } as never);
    expect(ttlDuringRun).toBe(EXPORT_SLOT_RUNNING_TTL_SECONDS);
  });
});

describe("export job status", () => {
  const job = (over: Record<string, unknown> = {}) => ({
    data: DATA,
    getState: async () => "completed",
    returnvalue: { filename: "book.epub", format: "epub", warnings: [] },
    failedReason: undefined,
    ...over,
  });
  const status = (jobId = "42", bookId = B) =>
    bookJobStatus(new NextRequest(`http://t/x`), { params: Promise.resolve({ id: bookId, jobId }) });

  it("readOwnExportJob refuses another writer's job and another book's job", async () => {
    h.queue.getJob.mockResolvedValue(job({ data: { ...DATA, userId: "intruder" } }));
    expect(await readOwnExportJob("42", "u1", "book", B)).toBeNull();
    h.queue.getJob.mockResolvedValue(job());
    expect(await readOwnExportJob("42", "u1", "book", "another-book")).toBeNull();
    expect(await readOwnExportJob("42", "u1", "series", B)).toBeNull();
    expect(await readOwnExportJob("42", "u1", "book", B)).not.toBeNull();
  });

  it("a finished job answers the export result", async () => {
    h.queue.getJob.mockResolvedValue(job());
    expect(await (await status()).json()).toEqual({ state: "completed", result: job().returnvalue });
  });

  it("a failed job answers its code only", async () => {
    h.queue.getJob.mockResolvedValue(job({ getState: async () => "failed", failedReason: "CONVERSION_FAILED" }));
    expect(await (await status()).json()).toEqual({ state: "failed", code: "CONVERSION_FAILED" });
  });

  it("a job that has vanished (state unknown) is a 404 with a code, not 'queued' forever", async () => {
    h.queue.getJob.mockResolvedValue(job({ getState: async () => "unknown" }));
    const res = await status();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("EXPORT_FAILED");
  });

  it("an unknown or foreign job is a 404", async () => {
    h.queue.getJob.mockResolvedValue(null);
    expect((await status()).status).toBe(404);
  });
});

describe("awaitExportJob (client)", () => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("polls until the job finishes and resolves with its result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ state: "queued" }))
      .mockResolvedValueOnce(respond({ state: "running" }))
      .mockResolvedValueOnce(respond({ state: "completed", result: { filename: "b.pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await awaitExportJob("/status", { sleep: async () => {} });
    expect(result).toEqual({ filename: "b.pdf" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("rides out a dropped request instead of giving up on a job that is still running", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(respond({ state: "completed", result: { filename: "b.pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await awaitExportJob("/status", { sleep: async () => {} })).toEqual({ filename: "b.pdf" });
    vi.unstubAllGlobals();
  });

  it("waits at least as long as the slot may wait in the queue", () => {
    expect(EXPORT_POLL_TIMEOUT_MS).toBeGreaterThanOrEqual(EXPORT_SLOT_QUEUED_TTL_SECONDS * 1000);
  });

  it("rejects with the job's code so the screen can say it in the writer's language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ state: "failed", code: "CONVERSION_FAILED" })));
    const failure = await awaitExportJob("/status", { sleep: async () => {} }).catch((e: unknown) => e);
    expect((failure as { body: { code: string } }).body).toEqual({ code: "CONVERSION_FAILED" });
    vi.unstubAllGlobals();
  });
});
