// tests/unit/api-keys-create-status.test.ts
// D-59 (P6 Owen func #8, S4) route-level regression: POST /api/settings/api-keys
// upserts one key per (user, provider) but always answered 201 Created — so
// re-submitting an existing provider key reported a pre-existing row as newly
// created (the judge's trace: a 201 whose createdAt was a day earlier). Honest
// REST semantics: 201 only when a new row is created, 200 when an existing row
// is updated. The client (useAddApiKey) checks `res.ok`, so both stay success.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  validateApiKey: vi.fn(),
  parseJsonBody: vi.fn(),
  db: {
    apiKey: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({
  encryptApiKey: (v: string) => `enc:${v}`,
  decryptApiKey: (v: string) => v,
  maskApiKey: () => "sk-or-v...mask",
}));
vi.mock("@/lib/llm/key-validator", () => ({
  validateApiKey: (...args: unknown[]) => h.validateApiKey(...args),
}));
vi.mock("@/lib/api/parse-json-body", () => ({
  parseJsonBody: (req: unknown) => h.parseJsonBody(req),
  invalidJsonBodyResponse: () => null,
}));

import { POST } from "@/app/api/settings/api-keys/route";

const upsertRow = {
  id: "k1",
  provider: "openrouter",
  label: "Owen OpenRouter",
  isDefault: true,
  validatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.validateApiKey.mockResolvedValue({ valid: true });
  h.parseJsonBody.mockResolvedValue({
    provider: "openrouter",
    key: "sk-or-v1-realish-key",
    label: "Owen OpenRouter",
  });
  h.db.apiKey.upsert.mockResolvedValue(upsertRow);
});

describe("POST /api/settings/api-keys — create vs update honesty (D-59)", () => {
  it("returns 201 Created when no key exists for the provider", async () => {
    h.db.apiKey.findMany.mockResolvedValue([]); // user has no keys yet

    const res = await POST({} as never);

    expect(res.status).toBe(201);
    expect(h.db.apiKey.upsert).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.id).toBe("k1");
    expect(body.provider).toBe("openrouter");
  });

  it("returns 201 when adding a NEW provider while other providers exist", async () => {
    // User already has an anthropic key, now adds an openrouter key.
    h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic" }]);

    const res = await POST({} as never);

    expect(res.status).toBe(201);
  });

  it("returns 200 OK when the provider key already exists (upsert-as-update)", async () => {
    // The same provider key was created earlier — this is an update, not a create.
    h.db.apiKey.findMany.mockResolvedValue([{ provider: "openrouter" }]);

    const res = await POST({} as never);

    expect(res.status).toBe(200);
    expect(h.db.apiKey.upsert).toHaveBeenCalledTimes(1);
    // Body shape is unchanged — only the status code carries the create/update signal.
    const body = await res.json();
    expect(body.id).toBe("k1");
    expect(body.provider).toBe("openrouter");
  });
});
