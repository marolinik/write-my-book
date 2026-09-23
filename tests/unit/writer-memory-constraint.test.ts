import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: { writerMemory: { upsert: vi.fn() } }, supersede: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/agents/rule-dedupe-service", () => ({ supersedeDuplicateRule: h.supersede }));

import { upsertConversationConstraint } from "@/lib/agents/writer-memory";

beforeEach(() => vi.clearAllMocks());

describe("upsertConversationConstraint", () => {
  it("upserts keyed by (userId, findingId, source) with server bookId scope", async () => {
    h.db.writerMemory.upsert.mockResolvedValue({});
    await upsertConversationConstraint({
      userId: "u1", bookId: "b1", findingId: "f1", category: "preference", content: "Keep it terse.",
    });
    const arg = h.db.writerMemory.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_findingId_source: { userId: "u1", findingId: "f1", source: "conversation" } });
    expect(arg.create.bookId).toBe("b1");
    expect(arg.create.source).toBe("conversation");
    expect(arg.create.category).toBe("preference");
  });
  it("retires an older rule that says the same thing, once the new one is saved", async () => {
    h.db.writerMemory.upsert.mockResolvedValue({ id: "m-new" });
    h.supersede.mockResolvedValue({ superseded: "m-old", kept: "m-new" });
    await upsertConversationConstraint({
      userId: "u1", bookId: "b1", findingId: "f1", category: "preference", content: "Dva predmeta.",
    });
    expect(h.supersede).toHaveBeenCalledWith({ memoryId: "m-new" });
  });

  it("keeps the saved rule when the duplicate check breaks", async () => {
    h.db.writerMemory.upsert.mockResolvedValue({ id: "m-new" });
    h.supersede.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      upsertConversationConstraint({ userId: "u1", bookId: "b1", findingId: "f1", category: "preference", content: "x" })
    ).resolves.toBeUndefined();
  });
});
