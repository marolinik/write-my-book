// Wave 7 / D22 (P2-76): exports are jobs on the worker. The route enqueues
// (202 + job id) under a per-writer Redis slot, the worker converts, and the
// client polls a status route that only the job's owner can read.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  redis: { set: vi.fn(), del: vi.fn() },
  queue: { add: vi.fn(), getJob: vi.fn() },
  db: { book: { findFirst: vi.fn() }, series: { findFirst: vi.fn() } },
  run: { book: vi.fn(), series: vi.fn() },
}));

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

import { enqueueExport, readOwnExportJob } from "@/lib/queue/export-queue";
import { POST as postBookExport } from "@/app/api/books/[id]/export/route";
import { GET as bookJobStatus } from "@/app/api/books/[id]/export/jobs/[jobId]/route";
import { awaitExportJob } from "@/lib/import-export/await-export-job";
import { processExportJob } from "@/lib/queue/export-worker";

const B = "00000000-0000-4000-8000-0000000000bb";
const DATA = { kind: "book" as const, userId: "u1", targetId: B, request: { format: "epub" as const } };

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.set.mockResolvedValue("OK");
  h.redis.del.mockResolvedValue(1);
  h.queue.add.mockResolvedValue({ id: "42" });
  h.db.book.findFirst.mockResolvedValue({ id: B, userId: "u1" });
});

describe("enqueueExport", () => {
  it("takes the writer's slot (SET NX with a TTL) and queues the job", async () => {
    expect(await enqueueExport(DATA)).toEqual({ jobId: "42" });
    expect(h.redis.set).toHaveBeenCalledWith("export:running:u1", "1", "EX", expect.any(Number), "NX");
    expect(h.queue.add).toHaveBeenCalledWith("export", DATA);
  });

  it("refuses while the writer already has an export queued or running", async () => {
    h.redis.set.mockResolvedValue(null);
    expect(await enqueueExport(DATA)).toBeNull();
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it("frees the slot when the enqueue itself fails", async () => {
    h.queue.add.mockRejectedValue(new Error("redis gone"));
    await expect(enqueueExport(DATA)).rejects.toThrow("redis gone");
    expect(h.redis.del).toHaveBeenCalledWith("export:running:u1");
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
    expect(await res.json()).toEqual({ jobId: "42", status: "queued" });
  });

  it("answers 429 RATE_LIMITED while the writer's export runs", async () => {
    h.redis.set.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });
});

describe("processExportJob (worker)", () => {
  const RESULT = { filename: "book.epub", format: "epub", warnings: [] };

  it("runs the book export, returns its result and frees the writer's slot", async () => {
    h.run.book.mockResolvedValue(RESULT);
    expect(await processExportJob({ id: "j1", data: DATA } as never)).toEqual(RESULT);
    expect(h.run.book).toHaveBeenCalledWith("u1", B, { format: "epub" });
    expect(h.run.series).not.toHaveBeenCalled();
    expect(h.redis.del).toHaveBeenCalledWith("export:running:u1");
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
    const failure = (await processExportJob({ id: "j3", data: DATA } as never).catch((e: unknown) => e)) as Error;
    expect(failure.message).toBe("EXPORT_FAILED");
    expect(h.redis.del).toHaveBeenCalledWith("export:running:u1");
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

  it("rejects with the job's code so the screen can say it in the writer's language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ state: "failed", code: "CONVERSION_FAILED" })));
    const failure = await awaitExportJob("/status", { sleep: async () => {} }).catch((e: unknown) => e);
    expect((failure as { body: { code: string } }).body).toEqual({ code: "CONVERSION_FAILED" });
    vi.unstubAllGlobals();
  });
});
