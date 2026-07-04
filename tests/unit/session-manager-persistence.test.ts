import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    conversationTurn: { count: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

import {
  addUserMessage,
  addAssistantMessage,
  loadConversationHistory,
} from "@/lib/agents/session-manager";

function row(turnIndex: number, role: "user" | "assistant", text: string) {
  return { sessionId: "s1", turnIndex, role, content: JSON.stringify(text) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.conversationTurn.count.mockResolvedValue(0);
  h.db.conversationTurn.create.mockResolvedValue({});
  h.db.conversationTurn.findMany.mockResolvedValue([]);
});

describe("addUserMessage / addAssistantMessage — DB persistence", () => {
  it("writes a user turn with a count-derived, monotonic turnIndex", async () => {
    h.db.conversationTurn.count.mockResolvedValue(3);
    await addUserMessage("s1", "hello");
    expect(h.db.conversationTurn.count).toHaveBeenCalledWith({ where: { sessionId: "s1" } });
    expect(h.db.conversationTurn.create).toHaveBeenCalledWith({
      data: { sessionId: "s1", turnIndex: 3, role: "user", content: JSON.stringify("hello") },
    });
  });

  it("writes an assistant turn storing only the final text", async () => {
    h.db.conversationTurn.count.mockResolvedValue(4);
    await addAssistantMessage("s1", "coach reply");
    expect(h.db.conversationTurn.create).toHaveBeenCalledWith({
      data: { sessionId: "s1", turnIndex: 4, role: "assistant", content: JSON.stringify("coach reply") },
    });
  });

  it("is fire-safe: a persistence failure is swallowed (never throws)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.db.conversationTurn.create.mockRejectedValueOnce(new Error("db down"));
    await expect(addUserMessage("s1", "x")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("loadConversationHistory — rehydration", () => {
  it("reads newest-first, capped at 40, ordered by createdAt (then turnIndex)", async () => {
    await loadConversationHistory("s1");
    expect(h.db.conversationTurn.findMany).toHaveBeenCalledWith({
      where: { sessionId: "s1" },
      orderBy: [{ createdAt: "desc" }, { turnIndex: "desc" }],
      take: 40,
    });
  });

  it("returns turns in chronological order with content parsed", async () => {
    // DB (desc) order → reversed to chronological inside the function.
    h.db.conversationTurn.findMany.mockResolvedValue([
      row(3, "assistant", "a2"),
      row(2, "user", "u2"),
      row(1, "assistant", "a1"),
      row(0, "user", "u1"),
    ]);
    const msgs = await loadConversationHistory("s1");
    expect(msgs).toEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("trims a leading assistant turn and a dangling trailing user turn for valid alternation", async () => {
    // Chronological would be: [a0, u1, a1, u2] → trim leading a0 and trailing u2.
    h.db.conversationTurn.findMany.mockResolvedValue([
      row(3, "user", "u2"),
      row(2, "assistant", "a1"),
      row(1, "user", "u1"),
      row(0, "assistant", "a0"),
    ]);
    const msgs = await loadConversationHistory("s1");
    expect(msgs).toEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
  });

  it("collapses INTERIOR consecutive user turns (cancelled turn + retry) to the latest, keeping alternation", async () => {
    // A user turn was persisted, its assistant reply cancelled/errored (never
    // persisted), then the user retried → two adjacent interior user turns.
    // Chronological: [u_cancelled, u_retry, a] → collapse users to u_retry.
    h.db.conversationTurn.findMany.mockResolvedValue([
      row(2, "assistant", "a"),
      row(1, "user", "u_retry"),
      row(0, "user", "u_cancelled"),
    ]);
    const msgs = await loadConversationHistory("s1");
    expect(msgs).toEqual([
      { role: "user", content: "u_retry" },
      { role: "assistant", content: "a" },
    ]);
  });

  it("collapses interior consecutive assistant turns to the latest", async () => {
    // Chronological: [u, a_partial, a_final] → collapse assistants to a_final.
    h.db.conversationTurn.findMany.mockResolvedValue([
      row(2, "assistant", "a_final"),
      row(1, "assistant", "a_partial"),
      row(0, "user", "u"),
    ]);
    const msgs = await loadConversationHistory("s1");
    expect(msgs).toEqual([
      { role: "user", content: "u" },
      { role: "assistant", content: "a_final" },
    ]);
  });

  it("collapses a run of only-user turns then trims to empty (no valid pair)", async () => {
    // Two user turns, never any assistant → collapse to one user → trailing-user
    // trim empties it, rather than emitting an invalid single-user history.
    h.db.conversationTurn.findMany.mockResolvedValue([
      row(1, "user", "u2"),
      row(0, "user", "u1"),
    ]);
    const msgs = await loadConversationHistory("s1");
    expect(msgs).toEqual([]);
  });
});
