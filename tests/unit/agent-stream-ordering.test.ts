// P2-15: the background stream replayed the Redis list, THEN subscribed. A
// message published in between (the worker even published before rpush) was
// lost; a lost "complete" left the writer on a spinner forever. The route now
// subscribes first, replays, and drops live duplicates by their list index.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { encodeLiveEvent, decodeLiveEvent } from "@/lib/queue/session-stream";

const h = vi.hoisted(() => ({
  onMessage: null as null | ((channel: string, raw: string) => void),
  list: [] as string[],
  status: null as string | null,
  beforeLrange: null as null | (() => void),
  dbSession: { jobId: "job1", status: "running" } as null | { jobId: string; status: string },
  findFirstArgs: [] as unknown[],
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({
  db: {
    agentSession: {
      findFirst: async (args: unknown) => {
        h.findFirstArgs.push(args);
        return h.dbSession;
      },
    },
  },
}));
vi.mock("@/lib/agents", () => ({ getSession: () => undefined, addListener: () => () => {} }));
vi.mock("@/lib/health/worker-liveness", () => ({
  isJobStuckWithoutWorker: async () => false,
  WORKER_ABSENT_MESSAGE: "no worker",
}));
vi.mock("@/lib/queue", () => ({
  createRedisConnection: () => ({
    on: (event: string, fn: (channel: string, raw: string) => void) => {
      if (event === "message") h.onMessage = fn;
    },
    subscribe: async () => 1,
    unsubscribe: async () => 1,
    disconnect: () => {},
  }),
}));
vi.mock("@/lib/queue/connection", () => ({
  getAppConnection: () => ({
    lrange: async () => {
      h.beforeLrange?.();
      return [...h.list];
    },
    get: async () => h.status,
  }),
}));

import { GET } from "@/app/api/books/[id]/agent/[sessionId]/stream/route";

const text = (content: string) => JSON.stringify({ type: "text", content });
const COMPLETE = JSON.stringify({ type: "complete", content: "done" });

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out;
    out += decoder.decode(value);
  }
}

beforeEach(() => {
  h.onMessage = null;
  h.list = [];
  h.status = null;
  h.beforeLrange = null;
  h.dbSession = { jobId: "job1", status: "running" };
  h.findFirstArgs = [];
});

// P2-64 (Wave 5 Task 6): the stream is ownership-checked like every other session route.
describe("stream ownership", () => {
  it("answers another writer's session with one coded SESSION_NOT_FOUND event and closes", async () => {
    h.dbSession = null;
    const res = await GET(new NextRequest("http://test/api/books/b1/agent/s1/stream"), {
      params: Promise.resolve({ id: "b1", sessionId: "s1" }),
    });
    const body = await readAll(res);
    const frames = body.split("\n\n").filter(Boolean);
    expect(frames).toHaveLength(1);
    const data = frames[0].slice(frames[0].indexOf("data: ") + "data: ".length);
    expect(JSON.parse(data)).toMatchObject({ type: "error", metadata: { code: "SESSION_NOT_FOUND" } });
    expect(h.findFirstArgs[0]).toMatchObject({ where: { id: "s1", bookId: "b1", userId: "u1" } });
  });
});

describe("live event envelope", () => {
  it("round-trips the list index and the data", () => {
    expect(decodeLiveEvent(encodeLiveEvent(4, text("x")))).toEqual({ index: 4, data: text("x") });
  });

  it("treats a bare message (an old publisher) as unindexed", () => {
    expect(decodeLiveEvent(text("x"))).toEqual({ index: null, data: text("x") });
  });
});

describe("GET stream (background job)", () => {
  it("delivers a complete published between subscribe and replay exactly once, then closes", async () => {
    h.list = [text("a"), text("b"), COMPLETE];
    // The worker rpushes index 2 and publishes it while the route is replaying.
    h.beforeLrange = () => h.onMessage?.("session:s1", encodeLiveEvent(2, COMPLETE));

    const res = await GET(new NextRequest("http://t/api/books/b1/agent/s1/stream"), {
      params: Promise.resolve({ id: "b1", sessionId: "s1" }),
    });
    const body = await readAll(res);
    expect(body.match(/"type":"complete"/g)).toHaveLength(1);
    expect(body).toContain("id: 2\n");
  });

  it("closes after replay when the status was already terminal and nothing new arrives", async () => {
    h.list = [text("a")];
    h.status = "completed";
    const res = await GET(new NextRequest("http://t/api/books/b1/agent/s1/stream"), {
      params: Promise.resolve({ id: "b1", sessionId: "s1" }),
    });
    const body = await readAll(res);
    expect(body).toContain("id: 0\n");
  });
});
