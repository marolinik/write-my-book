import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase B — /structure/moves/:moveId/draft.
 *
 * POST asks the book's ghostwriter for the draft of a trim/expand, GET shows it
 * beside the chapter as it is, DELETE throws it away. Billing follows Polish
 * Scene: the plan check and the Free polish meter gate it, tokens are billed
 * when the model actually ran, and the meter ticks only for a usable draft.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    structureMove: { findFirst: vi.fn() },
    chapter: { findFirst: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  checkQuota: vi.fn(),
  recordDailyUse: vi.fn(),
  estimateCost: vi.fn(() => 0.01),
  resolveGhostwriterClient: vi.fn(),
  draftRewriteMove: vi.fn(),
  discardRewriteDraft: vi.fn(),
  readChapter: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: h.checkQuota }));
vi.mock("@/lib/billing/free-tier-meters", () => ({ recordDailyUse: h.recordDailyUse }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/editorial/book-evidence", () => ({
  readVoiceFingerprint: vi.fn(async () => "glas"),
  readStoryBible: vi.fn(async () => "kanon"),
}));
vi.mock("@/lib/llm/ghostwriter-client", () => ({ resolveGhostwriterClient: h.resolveGhostwriterClient }));
vi.mock("@/lib/structure/rewrite-move", () => ({
  draftRewriteMove: h.draftRewriteMove,
  discardRewriteDraft: h.discardRewriteDraft,
  readCurrentChapterText: h.readChapter,
}));

import { POST, GET, DELETE } from "@/app/api/books/[id]/structure/moves/[moveId]/draft/route";

const ctx = { params: Promise.resolve({ id: "b1", moveId: "m1" }) };
const req = (method = "POST") => new Request("http://t/x", { method }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "sr", settings: null });
  h.checkQuota.mockResolvedValue({ allowed: true, isFree: true });
  h.resolveGhostwriterClient.mockResolvedValue({
    ok: true,
    client: { messages: { create: h.create } },
    model: { modelId: "qwen", provider: "local" },
    resolved: { registryId: "local/qwen", modelDef: { unfitForQuickAssist: false } },
    route: { route: "local" },
  });
  h.create.mockResolvedValue({
    content: [{ type: "text", text: "nacrt" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 9000, output_tokens: 2000 },
  });
  h.draftRewriteMove.mockImplementation(async (_id: string, _ctx: unknown, generate: Function) => {
    const g = await generate({ system: "s", user: "u", maxTokens: 4000 });
    return { ok: true, baseWords: 1000, draftWords: 720, tokens: g.tokens };
  });
});

describe("POST draft", () => {
  it("404s on someone else's book", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(404);
    expect(h.draftRewriteMove).not.toHaveBeenCalled();
  });

  it("is gated by the polish quota", async () => {
    h.checkQuota.mockResolvedValue({ allowed: false, reason: "cap", upgradeToTier: "indie" });
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(429);
    expect(h.checkQuota).toHaveBeenCalledWith("u1", "polish_scene");
    expect(h.draftRewriteMove).not.toHaveBeenCalled();
  });

  it("says so when no key can reach the ghostwriter's model", async () => {
    h.resolveGhostwriterClient.mockResolvedValue({ ok: false });
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(400);
  });

  it("drafts through the ghostwriter, bills the tokens and ticks the Free meter", async () => {
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ drafted: true, baseWords: 1000, draftWords: 720 });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.db.usageRecord.create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      bookId: "b1",
      agentType: "structure-rewrite",
      tokensInput: 9000,
      tokensOutput: 2000,
    });
    expect(h.recordDailyUse).toHaveBeenCalledWith("u1", "polish");
  });

  it("bills a draft the judge refused but does not tick the meter", async () => {
    h.draftRewriteMove.mockResolvedValue({
      ok: false,
      error: { code: "draft_rejected", message: "x" },
      tokens: { input: 9000, output: 2000 },
    });
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(502);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).not.toHaveBeenCalled();
  });

  it("maps a reasoning-only model to 422", async () => {
    h.draftRewriteMove.mockResolvedValue({ ok: false, error: { code: "model_no_prose", message: "x" } });
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(422);
  });

  it("answers 409 when the move is no longer waiting", async () => {
    h.draftRewriteMove.mockResolvedValue({ ok: false, error: { code: "not_pending", message: "x" } });
    const res = await POST(req(), ctx as never);
    expect(res.status).toBe(409);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });
});

describe("GET draft", () => {
  it("shows the draft beside the chapter as it is now", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({
      id: "m1",
      kind: "trim",
      status: "drafted",
      draft: "kraće",
      draftMeta: JSON.stringify({ baseWords: 1000, draftWords: 720 }),
      payload: JSON.stringify({ kind: "trim", chapterId: "c2", chapterNumber: 2 }),
    });
    h.readChapter.mockResolvedValue("duže");
    const res = await GET(req("GET"), ctx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ before: "duže", after: "kraće", baseWords: 1000, draftWords: 720 });
  });

  it("404s when there is no draft", async () => {
    h.db.structureMove.findFirst.mockResolvedValue({ id: "m1", status: "pending", draft: null });
    const res = await GET(req("GET"), ctx as never);
    expect(res.status).toBe(404);
  });
});

describe("DELETE draft", () => {
  it("discards the draft and the move waits again", async () => {
    h.discardRewriteDraft.mockResolvedValue(true);
    const res = await DELETE(req("DELETE"), ctx as never);
    expect(res.status).toBe(200);
    expect(h.discardRewriteDraft).toHaveBeenCalledWith("m1", "b1");
  });

  it("409s when there was no draft to discard", async () => {
    h.discardRewriteDraft.mockResolvedValue(false);
    const res = await DELETE(req("DELETE"), ctx as never);
    expect(res.status).toBe(409);
  });
});
