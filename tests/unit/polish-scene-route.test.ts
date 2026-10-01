import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/books/:id/polish-scene: two rewrites of the scene the writer
 * selected, asked in parallel on the ghostwriter's model. Each half settles on
 * its own, so one failure still hands the writer the other version, and only
 * prose that actually came back is billed.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  create: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  checkQuota: vi.fn(),
  recordDailyUse: vi.fn(),
  estimateCost: vi.fn(),
  decryptApiKey: vi.fn(),
  resolveModelForRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  createLLMClient: vi.fn(),
  readVoiceFingerprint: vi.fn(),
  readStoryBible: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: h.decryptApiKey }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: h.checkQuota }));
vi.mock("@/lib/billing/free-tier-meters", () => ({ recordDailyUse: h.recordDailyUse }));
vi.mock("@/lib/editorial/book-evidence", () => ({
  readVoiceFingerprint: h.readVoiceFingerprint,
  readStoryBible: h.readStoryBible,
}));
vi.mock("@/lib/llm", () => ({
  createLLMClient: h.createLLMClient,
  resolveModelForRole: h.resolveModelForRole,
  resolveRouteWithLocalFallback: (model: { provider?: string }) => ({
    route: h.resolveProviderRoute(model?.provider),
    model,
  }),
}));

import { POST } from "@/app/api/books/[id]/polish-scene/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown, signal?: AbortSignal) {
  return new Request("http://t/api/books/b1/polish-scene", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

const SCENE =
  "Mara stood at the window.\nThe harbour lights went out one by one, and she counted them the way her father had taught her.";
const LIGHT = "Mara stood at the window. The harbour lights went out, one by one, and she counted them as her father had taught her.";
const BOLD = "At the window, Mara watched the harbour go dark light by light, counting each one the way her father had shown her.";

function reply(text: string, stop_reason = "end_turn", output_tokens = 60) {
  return {
    content: text ? [{ type: "text", text }] : [],
    stop_reason,
    usage: { input_tokens: 500, output_tokens },
  };
}

type Params = { system: string };
function byIntensity(light: () => unknown, bold: () => unknown) {
  h.create.mockImplementation(async (params: Params) =>
    params.system.includes("LIGHT POLISH") ? light() : bold()
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "en", settings: null });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true, isFree: false });
  h.estimateCost.mockReturnValue(0.01);
  h.decryptApiKey.mockReturnValue("sk-test");
  h.resolveModelForRole.mockReturnValue({
    registryId: "anthropic/opus",
    modelDef: { id: "anthropic/opus", provider: "anthropic" },
  });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: { messages: { create: h.create } },
    model: { modelId: "claude-opus", id: "anthropic/opus", provider: "anthropic" },
  });
  h.readVoiceFingerprint.mockResolvedValue("FINGERPRINT-MARKER");
  h.readStoryBible.mockResolvedValue("BIBLE-MARKER");
});

describe("POST /api/books/:id/polish-scene", () => {
  it("returns a light and a bold version, written on the ghostwriter's model with the voice and canon", async () => {
    byIntensity(() => reply(LIGHT), () => reply(BOLD));
    const res = await POST(req({ selectedText: SCENE }) as never, ctx as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.versions).toEqual([
      { intensity: "light", text: LIGHT },
      { intensity: "bold", text: BOLD },
    ]);
    expect(body.failed).toEqual([]);
    expect(h.resolveModelForRole.mock.calls[0][0]).toBe("ghostwriter");
    expect(h.create).toHaveBeenCalledTimes(2);
    const system = (h.create.mock.calls[0][0] as Params).system;
    expect(system).toContain("FINGERPRINT-MARKER");
    expect(system).toContain("BIBLE-MARKER");
  });

  it("bills both halves in one usage record", async () => {
    byIntensity(() => reply(LIGHT), () => reply(BOLD));
    await POST(req({ selectedText: SCENE }) as never, ctx as never);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data.agentType).toBe("polish-scene");
    expect(data.tokensInput).toBe(1000);
    expect(data.tokensOutput).toBe(120);
  });

  it("still returns the light version when the bold call fails, and bills only the light one", async () => {
    byIntensity(
      () => reply(LIGHT),
      () => {
        throw new Error("upstream 500");
      }
    );
    const res = await POST(req({ selectedText: SCENE }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.versions).toEqual([{ intensity: "light", text: LIGHT }]);
    expect(body.failed).toEqual([{ intensity: "bold", reason: "error" }]);
    expect(h.db.usageRecord.create.mock.calls[0][0].data.tokensOutput).toBe(60);
  });

  it("never offers a rewrite cut off by the token limit, and bills nothing when neither survived", async () => {
    byIntensity(() => reply(LIGHT, "max_tokens"), () => reply(BOLD, "max_tokens"));
    const res = await POST(req({ selectedText: SCENE }) as never, ctx as never);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.retryable).toBe(true);
    expect(body.failed).toEqual([
      { intensity: "light", reason: "truncated" },
      { intensity: "bold", reason: "truncated" },
    ]);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("writes a Serbian book's rewrite in Latin script whatever the model chose", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b1", language: "sr", settings: null });
    const cyr = "Мара је стајала на прозору и бројала светла у луци, једно по једно, као што ју је отац научио.";
    byIntensity(() => reply(cyr), () => reply(cyr));
    const res = await POST(req({ selectedText: SCENE }) as never, ctx as never);
    const body = await res.json();
    expect(body.versions[0].text).toMatch(/^Mara je stajala/);
  });

  it("refuses a selection longer than one scene can be", async () => {
    const res = await POST(req({ selectedText: "a".repeat(20_001) }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("answers 404 for a book the writer does not own", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await POST(req({ selectedText: SCENE }) as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("passes a quota denial through as 429", async () => {
    h.checkQuota.mockResolvedValue({ allowed: false, reason: "cap", upgradeToTier: "indie" });
    const res = await POST(req({ selectedText: SCENE }) as never, ctx as never);
    expect(res.status).toBe(429);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("answers 499 and bills nothing when the writer cancelled", async () => {
    const controller = new AbortController();
    byIntensity(
      () => {
        controller.abort();
        return reply(LIGHT);
      },
      () => reply(BOLD)
    );
    const res = await POST(req({ selectedText: SCENE }, controller.signal) as never, ctx as never);
    expect(res.status).toBe(499);
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("ticks the Free daily meter once, only after a result", async () => {
    h.checkQuota.mockResolvedValue({ allowed: true, isFree: true });
    byIntensity(() => reply(LIGHT), () => reply(BOLD));
    await POST(req({ selectedText: SCENE }) as never, ctx as never);
    expect(h.recordDailyUse).toHaveBeenCalledTimes(1);
    expect(h.recordDailyUse).toHaveBeenCalledWith("u1", "inline");
  });
});
