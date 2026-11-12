// P2-44: an agent's store calls have a time limit. A hung Qdrant search or
// Neo4j query used to pin the worker slot for the client's own timeout
// (Qdrant: 300 s); the tool now answers "unavailable" within 10 s and the
// session carries on without that context.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const never = () => new Promise<never>(() => {});
const h = vi.hoisted(() => ({ searchMemory: vi.fn(), getCharacterNetwork: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/vector/retriever", () => ({
  searchMemory: h.searchMemory,
  formatSearchResults: () => "results",
}));
vi.mock("@/lib/graph/graph-queries", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getCharacterNetwork: h.getCharacterNetwork,
}));

import { executeTool } from "@/lib/agents/tools";
import { withTimeout, StoreTimeoutError, STORE_CALL_TIMEOUT_MS } from "@/lib/async/with-timeout";

const ctx = { bookId: "b1", userId: "u1", sessionId: "s1", agentType: "dev-editor", documentService: {} } as never;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function settle<T>(p: Promise<T>): Promise<T> {
  const done = p.then((v) => v);
  await vi.advanceTimersByTimeAsync(STORE_CALL_TIMEOUT_MS + 1);
  return done;
}

describe("withTimeout", () => {
  it("rejects with StoreTimeoutError when the call outlives its budget", async () => {
    const p = withTimeout(never(), 1000, "qdrant search");
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await caught).toBeInstanceOf(StoreTimeoutError);
  });

  it("passes a timely result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, "x")).resolves.toBe(7);
  });
});

describe("agent store tools", () => {
  it("SearchMemory answers 'unavailable' within the budget when Qdrant hangs", async () => {
    h.searchMemory.mockImplementation(never);
    const out = await settle(executeTool("SearchMemory", ctx, { query: "the ring" }));
    expect(out).toMatch(/unavailable/i);
  });

  it("QueryGraph answers 'unavailable' within the budget when Neo4j hangs", async () => {
    h.getCharacterNetwork.mockImplementation(never);
    const out = await settle(executeTool("QueryGraph", ctx, { queryType: "character-network" }));
    expect(out).toMatch(/unavailable/i);
  });
});
