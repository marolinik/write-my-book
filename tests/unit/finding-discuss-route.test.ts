import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), update: vi.fn() },
    findingReply: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  runTurn: vi.fn(),
  gateStream: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/agents/writer-memory", () => ({ formatWriterMemoryForPrompt: () => Promise.resolve("") }));
// This file pins the PERSISTENCE semantics of a turn, so it drives the
// non-streaming fallback: `gateDiscussTurnStream` reports "unsupported" (the
// provider-cannot-stream branch) and the route runs the blocking turn below.
// The streamed contract has its own suite: tests/unit/discuss-stream-route.test.ts.
vi.mock("@/lib/editorial/discuss-llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorial/discuss-llm")>()),
  runDiscussTurn: h.runTurn,
  gateDiscussTurnStream: h.gateStream,
}));

import { POST } from "@/app/api/books/[id]/editorial/findings/[findingId]/discuss/route";

function req(body: unknown) {
  return new Request("http://t/discuss", { method: "POST", body: JSON.stringify(body) });
}
const ctx = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.gateStream.mockResolvedValue({ ok: false, reason: "unsupported" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.editFinding.findFirst.mockResolvedValue({ id: "f1", bookId: "b1", category: "dialogue", severity: "important", description: "d", alternatives: null, agentType: "line-editor" });
  h.db.findingReply.count.mockResolvedValue(0); // rate-limit count
  // $transaction runs the callback with a tx that mirrors db
  h.db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ ...h.db, $queryRaw: h.db.$queryRaw })
  );
  h.db.$queryRaw.mockResolvedValue([{ id: "f1" }]); // FOR UPDATE lock row
});

describe("POST /discuss", () => {
  it("persists one user + one assistant reply and returns parsed fields", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]); // 0 prior user turns
    h.runTurn.mockResolvedValue("Sure.\n<<<REVISION>>>\nsuggestion: new line\nwhy: clearer\n<<<END>>>");
    const res = await POST(req({ writerMessage: "keep it terse" }), ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.revisedSuggestion).toBe("new line");
    const roles = h.db.findingReply.create.mock.calls.map((c) => c[0].data.role);
    expect(roles).toEqual(["user", "assistant"]);
  });

  // D-41b: a concrete revision produced in discussion must be written back onto
  // the finding so a later plain Apply uses it — not the stale original.
  it("writes a non-empty revised suggestion back onto the finding (newText + alternatives[0])", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]);
    h.db.editFinding.findFirst.mockResolvedValue({
      id: "f1", bookId: "b1", category: "dialogue", severity: "important", description: "d",
      agentType: "line-editor",
      alternatives: JSON.stringify([
        { label: "Tighter", originalText: "the old line", newText: "stale one" },
        { label: "Softer", originalText: "the old line", newText: "stale two" },
      ]),
    });
    h.runTurn.mockResolvedValue("Sure.\n<<<REVISION>>>\nsuggestion: the agreed revision\nwhy: clearer\n<<<END>>>");

    const res = await POST(req({ writerMessage: "tighten it" }), ctx as never);
    expect(res.status).toBe(200);

    expect(h.db.editFinding.update).toHaveBeenCalledTimes(1);
    const data = h.db.editFinding.update.mock.calls[0][0].data;
    expect(data.newText).toBe("the agreed revision");
    const alts = JSON.parse(data.alternatives);
    expect(alts[0].newText).toBe("the agreed revision");
    expect(alts[0].originalText).toBe("the old line"); // target preserved
    expect(alts[1].newText).toBe("stale two"); // later alternatives untouched
  });

  it("writes only newText when the finding has no alternatives", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]); // alternatives: null from beforeEach
    h.runTurn.mockResolvedValue("<<<REVISION>>>\nsuggestion: solo revision\nwhy: x\n<<<END>>>");

    await POST(req({ writerMessage: "x" }), ctx as never);

    expect(h.db.editFinding.update).toHaveBeenCalledTimes(1);
    const data = h.db.editFinding.update.mock.calls[0][0].data;
    expect(data.newText).toBe("solo revision");
    expect(data.alternatives).toBeUndefined();
  });

  it("does NOT write back when the assistant produced no revision", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]);
    h.runTurn.mockResolvedValue("Agreed — keep the line as written.");

    const res = await POST(req({ writerMessage: "leave it" }), ctx as never);
    expect((await res.json()).revisedSuggestion).toBeUndefined();
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
  });

  it("does NOT clobber the finding with an empty revision", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]);
    // Empty "suggestion:" line — the parser degrades this to no revision.
    h.runTurn.mockResolvedValue("Hm.\n<<<REVISION>>>\nsuggestion: \nwhy: clearer\n<<<END>>>");

    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    expect((await res.json()).revisedSuggestion).toBeUndefined();
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
  });

  it("short-circuits at 3 user turns with no model call", async () => {
    h.db.findingReply.findMany.mockResolvedValue([{ role: "user" }, { role: "user" }, { role: "user" }]);
    const res = await POST(req({ writerMessage: "again" }), ctx as never);
    expect((await res.json()).capped).toBe(true);
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  it("rate-limits beyond 200 user replies / 24h", async () => {
    h.db.findingReply.count.mockResolvedValue(201);
    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    expect(res.status).toBe(429);
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  // D-105: a discuss revision is a sentence-scoped compromise. When the finding's
  // originalText spans MORE prose than the revision replaces and there is no anchor
  // to narrow against, arming the revision onto newText would let a later plain
  // Apply silently DELETE the un-discussed sentences. In that case skip the
  // write-back entirely and surface the revision in the thread only.
  it("does NOT arm a revision when originalText spans un-narrowable prose (no anchor)", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]);
    h.db.editFinding.findFirst.mockResolvedValue({
      id: "f1", bookId: "b1", category: "pacing", severity: "important", description: "d",
      agentType: "dev-editor", alternatives: null,
      originalText: "She ran. He watched. The rain fell.", // 3 sentences
      anchorQuote: null,
    });
    h.runTurn.mockResolvedValue("Sure.\n<<<REVISION>>>\nsuggestion: She bolted.\nwhy: punchier\n<<<END>>>");

    const res = await POST(req({ writerMessage: "tighten the first beat" }), ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.revisedSuggestion).toBe("She bolted."); // still surfaced in the thread
    expect(h.db.editFinding.update).not.toHaveBeenCalled(); // but NOT armed onto the finding
  });

  // D-105: when the anchorQuote is a concrete substring of originalText, the
  // replaced span can be narrowed coherently — persist the revision to newText AND
  // narrow originalText (and alternatives[0].originalText) to the anchor so a later
  // Apply replaces only the negotiated span, not the surrounding prose.
  it("narrows originalText to the anchor when arming a revision against a multi-sentence span", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]);
    h.db.editFinding.findFirst.mockResolvedValue({
      id: "f1", bookId: "b1", category: "pacing", severity: "important", description: "d",
      agentType: "dev-editor",
      originalText: "She ran. He watched. The rain fell.",
      anchorQuote: "He watched.",
      alternatives: JSON.stringify([
        { label: "Tighter", originalText: "She ran. He watched. The rain fell.", newText: "stale one" },
      ]),
    });
    h.runTurn.mockResolvedValue("Sure.\n<<<REVISION>>>\nsuggestion: He looked away.\nwhy: shifts the beat\n<<<END>>>");

    const res = await POST(req({ writerMessage: "make him look away" }), ctx as never);
    expect(res.status).toBe(200);

    expect(h.db.editFinding.update).toHaveBeenCalledTimes(1);
    const data = h.db.editFinding.update.mock.calls[0][0].data;
    expect(data.newText).toBe("He looked away.");
    expect(data.originalText).toBe("He watched."); // narrowed to the anchor span
    const alts = JSON.parse(data.alternatives);
    expect(alts[0].newText).toBe("He looked away.");
    expect(alts[0].originalText).toBe("He watched."); // alt span narrowed too
  });

  // D-04 regression: a reasoning model that returns no text must surface as an
  // honest 502 — NOT a 200 with an empty assistantMessage — and the failed turn
  // must neither persist any reply nor consume one of the writer's 3 turns.
  it("maps DiscussLLMEmptyError to 502 without persisting or consuming a turn", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]); // 0 prior user turns
    h.runTurn.mockRejectedValue(
      Object.assign(new Error("Discuss model returned no usable text"), {
        name: "DiscussLLMEmptyError",
      })
    );
    const res = await POST(req({ writerMessage: "keep it terse" }), ctx as never);
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error).toMatch(/turn was not used/i);
    expect(h.db.findingReply.create).not.toHaveBeenCalled();
  });
});
