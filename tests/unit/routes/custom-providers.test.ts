// P2-64 (Wave 5 Task 6): /api/settings/custom-providers had no route test.
// POST saves an endpoint only after discovery found models through the SSRF
// guard; the key is stored encrypted and answered masked. DELETE is
// ownership-fenced. A failure that is not the writer's input (the database)
// must not answer with its own message.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  class UnsafeUrlError extends Error {}
  return {
    user: { id: "u1" } as { id: string } | null,
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    safeExternalFetch: vi.fn(),
    allowPrivate: false,
    UnsafeUrlError,
  };
});

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!h.user) throw new Error("Unauthorized");
    return h.user;
  },
}));
vi.mock("@/lib/db", () => ({
  db: { customProvider: { findMany: h.findMany, create: h.create, deleteMany: h.deleteMany } },
}));
vi.mock("@/lib/encryption", () => ({
  encryptApiKey: (k: string) => `enc(${k})`,
  decryptApiKey: (k: string) => k.replace(/^enc\((.*)\)$/, "$1"),
  tryDecryptApiKey: (k: string) => (k.startsWith("enc(") ? k.replace(/^enc\((.*)\)$/, "$1") : null),
}));
vi.mock("@/lib/ssrf-guard", () => ({
  UnsafeUrlError: h.UnsafeUrlError,
  allowPrivateModelHosts: () => h.allowPrivate,
  safeExternalFetch: h.safeExternalFetch,
  readCappedText: async (res: { text: () => Promise<string> }) => res.text(),
}));

import { GET, POST, DELETE } from "@/app/api/settings/custom-providers/route";

const KEY = "sk-live-abcdefghijklmnop";

function post(body: unknown) {
  const req = new Request("http://test/api/settings/custom-providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(req);
}

function del(query: string) {
  return DELETE(new Request(`http://test/api/settings/custom-providers${query}`, { method: "DELETE" }) as unknown as NextRequest);
}

function listing(models: unknown[]) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ data: models }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: "u1" };
  h.allowPrivate = false;
  h.safeExternalFetch.mockResolvedValue(listing([{ id: "qwen-32b", context_length: 32768 }]));
  h.create.mockImplementation(async ({ data }) => ({ id: "cp1", ...data }));
});

describe("POST", () => {
  it("saves after discovery, encrypts the key and answers it masked", async () => {
    const res = await post({ displayName: " Box ", baseURL: "https://llm.example.com/v1", apiKey: KEY });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.maskedKey).toBe("sk-live...mnop");
    expect(JSON.stringify(body)).not.toContain(KEY);
    const saved = h.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({ userId: "u1", displayName: "Box", apiKey: `enc(${KEY})` });
    expect(saved.models).toEqual([{ id: "qwen-32b", contextWindow: 32768 }]);
    expect(h.safeExternalFetch.mock.calls[0][0]).toBe("https://llm.example.com/v1/models");
    expect(h.safeExternalFetch.mock.calls[0][2]).toEqual({ allowPrivate: false });
  });

  it("refuses an endpoint the SSRF guard blocks, with a neutral message and nothing saved", async () => {
    h.safeExternalFetch.mockRejectedValue(new h.UnsafeUrlError("169.254.169.254 is link-local"));
    const res = await post({ displayName: "x", baseURL: "http://169.254.169.254/latest" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("169.254");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("refuses an endpoint with no models", async () => {
    h.safeExternalFetch.mockResolvedValue(listing([]));
    expect((await post({ displayName: "x", baseURL: "https://llm.example.com/v1" })).status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("answers 400 for a bad body and for malformed JSON", async () => {
    expect((await post({ displayName: "", baseURL: "not a url" })).status).toBe(400);
    expect((await post("{oops")).status).toBe(400);
    expect(h.safeExternalFetch).not.toHaveBeenCalled();
  });

  it("answers 500 without the database's message when the save fails", async () => {
    h.create.mockRejectedValue(new Error('Invalid `prisma.customProvider.create()` invocation: connection to 10.0.0.5:5432 refused'));
    const res = await post({ displayName: "x", baseURL: "https://llm.example.com/v1" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/prisma|10\.0\.0\.5/);
  });

  it("answers 401 when signed out", async () => {
    h.user = null;
    expect((await post({ displayName: "x", baseURL: "https://llm.example.com/v1" })).status).toBe(401);
  });
});

describe("GET", () => {
  it("lists only the caller's providers, keys masked", async () => {
    h.findMany.mockResolvedValue([
      { id: "cp1", displayName: "Box", baseURL: "https://llm.example.com/v1", api: "openai-completions", apiKey: `enc(${KEY})`, models: [] },
    ]);
    const res = await GET();
    expect(h.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, orderBy: { createdAt: "asc" } });
    const [row] = await res.json();
    expect(row).toMatchObject({ hasKey: true, maskedKey: "sk-live...mnop" });
    expect(JSON.stringify(row)).not.toContain(KEY);
  });
});

describe("DELETE", () => {
  it("deletes only the caller's provider", async () => {
    h.deleteMany.mockResolvedValue({ count: 1 });
    expect((await del("?id=cp1")).status).toBe(200);
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { id: "cp1", userId: "u1" } });
  });

  it("answers 404 for another writer's provider and 400 without an id", async () => {
    h.deleteMany.mockResolvedValue({ count: 0 });
    expect((await del("?id=someone-elses")).status).toBe(404);
    expect((await del("")).status).toBe(400);
  });
});
