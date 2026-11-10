// P2-5: four AI routes skipped every plan gate (character chat, marketing
// kit, wiki populate, finding discuss), so the published Free limits were not
// true for them, and wiki populate recorded no usage at all. Each now answers
// 429 when the writer's plan denies an AI session, before any model call.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  checkQuota: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    usageRecord: { create: vi.fn() },
    wikiEntity: { findMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    findingReply: { count: vi.fn() },
  },
  messagesCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/quota-checker", () => ({ checkQuota: (...a: unknown[]) => h.checkQuota(...a) }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: () => "sk-or-test" }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    async findByType(type: string) {
      return type === "STORY_BIBLE" ? { id: "d1" } : null;
    }
    async read() {
      return { content: "Ana lives in Belgrade." };
    }
  },
}));
vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  resolveCheapModelFor: () => ({ id: "openrouter-deepseek-flash/sonnet", provider: "openrouter" }),
  resolveRouteWithLocalFallback: () => ({ route: { route: "openrouter" } }),
  createLLMClient: () => ({
    client: { messages: { create: h.messagesCreate } },
    model: { id: "openrouter-deepseek-flash/sonnet", modelId: "deepseek/deepseek-v4-flash" },
  }),
}));

import { POST as characterChat } from "@/app/api/books/[id]/character-chat/route";
import { POST as marketingKit } from "@/app/api/books/[id]/marketing-kit/route";
import { POST as wikiPopulate } from "@/app/api/books/[id]/wiki/populate/route";
import { POST as discuss } from "@/app/api/books/[id]/editorial/findings/[findingId]/discuss/route";

const DENIED = { allowed: false, reason: "Free plan limit reached", upgradeToTier: "indie" };
const params = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };
const post = (body: unknown = {}) =>
  new NextRequest("http://t/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.checkQuota.mockResolvedValue({ allowed: true });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", name: "B", language: "en", genre: null, chapters: [], documents: [] });
  h.db.chapter.findMany.mockResolvedValue([]);
  h.db.user.findUnique.mockResolvedValue({ defaultModel: null });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter", encryptedKey: "x" }]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.db.wikiEntity.findMany.mockResolvedValue([]);
  h.messagesCreate.mockResolvedValue({
    content: [{ type: "text", text: "[]" }],
    usage: { input_tokens: 1200, output_tokens: 80 },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ungated AI routes answer 429 when the plan denies an AI session", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["character chat", () => characterChat(post({ characterName: "Ana", message: "Hi" }), params as never)],
    ["marketing kit", () => marketingKit(post(), params as never)],
    ["wiki populate", () => wikiPopulate(post(), params as never)],
    ["finding discuss", () => discuss(post({ writerMessage: "Why?" }), params as never)],
  ];

  for (const [name, call] of cases) {
    it(name, async () => {
      h.checkQuota.mockResolvedValue(DENIED);
      const res = await call();
      expect(res.status).toBe(429);
      expect((await res.json()).upgradeToTier).toBe("indie");
      expect(h.checkQuota).toHaveBeenCalledWith("u1", "use_agent_session");
      expect(h.messagesCreate).not.toHaveBeenCalled();
    });
  }
});

describe("wiki populate", () => {
  it("records what the extraction cost", async () => {
    await wikiPopulate(post(), params as never);
    expect(h.messagesCreate).toHaveBeenCalledTimes(1);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    const data = h.db.usageRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: "u1",
      bookId: "b1",
      agentType: "wiki_populate",
      tokensInput: 1200,
      tokensOutput: 80,
    });
  });
});

describe("every API route that calls a model checks the plan first", () => {
  const API = join(__dirname, "..", "..", "src", "app", "api");
  const routeFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return routeFiles(full);
      return name === "route.ts" ? [full] : [];
    });

  it("no route.ts calls messages.create or messages.stream without a quota check", () => {
    const ungated = routeFiles(API).filter((file) => {
      const source = readFileSync(file, "utf-8");
      return /messages\.(create|stream)\(/.test(source) && !/checkQuota\(|denyIfOverQuota\(/.test(source);
    });
    expect(ungated.map((f) => f.slice(API.length))).toEqual([]);
  });

  it("the finding discussion route checks it too (its model call lives in discuss-llm)", () => {
    const route = readFileSync(
      join(API, "books", "[id]", "editorial", "findings", "[findingId]", "discuss", "route.ts"),
      "utf-8"
    );
    expect(route).toContain("denyIfOverQuota(");
  });
});
