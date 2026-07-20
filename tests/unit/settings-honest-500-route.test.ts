// tests/unit/settings-honest-500-route.test.ts
// Honesty sweep (companion to billing-subscription-route D-92b): three settings
// mutation handlers wrapped requireUser() + body-parse + DB write in a single
// `try { ... } catch { 400-if-invalid-json else 401 }`. Only requireUser()
// failing is a legitimate 401; a real DB/business error (db.user.update,
// validateApiKey, db.apiKey.upsert) also fell into that catch and was masked as
// a false "Unauthorized" — a logged-in writer saw a "you are not logged in"
// dead-end instead of an honest "something went wrong".
//
// Each handler is pinned for THREE cases:
//   1. requireUser() rejects            → 401 (unchanged).
//   2. malformed JSON body              → 400 (unchanged — REGRESSION LOCK).
//   3. valid auth + valid body, the
//      DB/business call throws          → 500, NOT 401 (RED against pre-fix).
//
// The real parse-json-body, validation, i18n and zod-error helpers are used so
// the 400 path is exercised end-to-end; only auth/db/crypto/network seams are
// mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1", preferredLanguage: "en" },
  requireUser: vi.fn(),
  validateApiKey: vi.fn(),
  db: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    apiKey: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
// default-model imports getModelDef from the barrel; an empty body never calls
// it, but the named import must still resolve.
vi.mock("@/lib/llm", () => ({ getModelDef: () => ({ id: "stub" }) }));
// api-keys: avoid env-dependent crypto and a real provider network round-trip.
vi.mock("@/lib/encryption", () => ({
  encryptApiKey: (v: string) => `enc:${v}`,
  decryptApiKey: (v: string) => v,
  maskApiKey: () => "sk-...mask",
}));
vi.mock("@/lib/llm/key-validator", () => ({
  validateApiKey: (...args: unknown[]) => h.validateApiKey(...args),
}));

import { PATCH as defaultModelPATCH } from "@/app/api/settings/default-model/route";
import { PATCH as languagePATCH } from "@/app/api/settings/language/route";
import { POST as apiKeysPOST } from "@/app/api/settings/api-keys/route";

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, { method, body: JSON.stringify(body) });
}
function rawReq(url: string, method: string, body: string) {
  return new Request(url, { method, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.validateApiKey.mockResolvedValue({ valid: true });
  h.db.user.update.mockResolvedValue({ id: "u1" });
  h.db.user.findUnique.mockResolvedValue({ id: "u1" });
  h.db.apiKey.findMany.mockResolvedValue([]);
  h.db.apiKey.upsert.mockResolvedValue({
    id: "k1",
    provider: "openrouter",
    label: null,
    isDefault: true,
    validatedAt: new Date(),
  });
  // Silence the honest server-side error log the 500 path emits.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── PATCH /api/settings/default-model ──────────────────────────────
describe("PATCH /api/settings/default-model — honest failure states", () => {
  const url = "http://t/api/settings/default-model";

  it("requireUser() rejection → 401 Unauthorized (unchanged)", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await defaultModelPATCH(jsonReq(url, "PATCH", {}) as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("malformed JSON body → 400 (REGRESSION LOCK)", async () => {
    const res = await defaultModelPATCH(rawReq(url, "PATCH", "{not json") as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid JSON in request body",
    });
    expect(h.db.user.update).not.toHaveBeenCalled();
  });

  it("db.user.update throwing → 500, NOT 401", async () => {
    h.db.user.update.mockRejectedValue(new Error("DB is down"));
    const res = await defaultModelPATCH(jsonReq(url, "PATCH", {}) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe("Unauthorized");
  });
});

// ── PATCH /api/settings/language ───────────────────────────────────
describe("PATCH /api/settings/language — honest failure states", () => {
  const url = "http://t/api/settings/language";

  it("requireUser() rejection → 401 Unauthorized (unchanged)", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await languagePATCH(jsonReq(url, "PATCH", { language: "en" }) as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("malformed JSON body → 400 (REGRESSION LOCK)", async () => {
    const res = await languagePATCH(rawReq(url, "PATCH", "{not json") as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid JSON in request body",
    });
    expect(h.db.user.update).not.toHaveBeenCalled();
  });

  it("db.user.update throwing → 500, NOT 401", async () => {
    h.db.user.update.mockRejectedValue(new Error("DB is down"));
    const res = await languagePATCH(jsonReq(url, "PATCH", { language: "en" }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe("Unauthorized");
  });
});

// ── POST /api/settings/api-keys ────────────────────────────────────
describe("POST /api/settings/api-keys — honest failure states", () => {
  const url = "http://t/api/settings/api-keys";
  const validBody = { provider: "openrouter", key: "sk-or-test-key", label: "t" };

  it("requireUser() rejection → 401 Unauthorized (unchanged)", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await apiKeysPOST(jsonReq(url, "POST", validBody) as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("malformed JSON body → 400 (REGRESSION LOCK)", async () => {
    const res = await apiKeysPOST(rawReq(url, "POST", "{not json") as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid JSON in request body",
    });
    expect(h.db.apiKey.upsert).not.toHaveBeenCalled();
  });

  it("db.apiKey.upsert throwing → 500, NOT 401", async () => {
    h.db.apiKey.upsert.mockRejectedValue(new Error("DB is down"));
    const res = await apiKeysPOST(jsonReq(url, "POST", validBody) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe("Unauthorized");
  });

  it("validateApiKey throwing (provider network error) → 500, NOT 401", async () => {
    h.validateApiKey.mockRejectedValue(new Error("provider unreachable"));
    const res = await apiKeysPOST(jsonReq(url, "POST", validBody) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe("Unauthorized");
  });
});
