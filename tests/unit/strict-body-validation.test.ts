// tests/unit/strict-body-validation.test.ts
// D-39 (P6/P8, S3): settings/preferences write routes used plain z.object()
// schemas, which SILENTLY STRIP unknown keys. An unknown/typo'd field returned
// 200 with the strip invisible, so the client believed the write took (this is
// the same mechanism that hid D-35's dropped setupComplete). These tests pin
// that every settings/preferences-class schema now .strict()-rejects unknown
// keys, still accepts its legitimate payloads, and that the shared error
// formatter names the offending key in plain language.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateSettingsSchema,
  updateLanguageSchema,
  createApiKeySchema,
  writingGoalSchema,
  exportConfigUpdateSchema,
} from "@/lib/validation";
import { zodErrorDetails } from "@/lib/api/zod-error";

// ─── Schema-level strict contract ────────────────────────────────

describe("settings/preferences schemas reject unknown keys (D-39)", () => {
  it("updateSettingsSchema: accepts known keys, rejects unknown", () => {
    expect(updateSettingsSchema.parse({ autoCommit: true }).autoCommit).toBe(true);
    expect(() =>
      updateSettingsSchema.parse({ autoCommit: true, sneaky: "x" })
    ).toThrow();
  });

  it("updateLanguageSchema: accepts { language }, rejects unknown", () => {
    expect(updateLanguageSchema.parse({ language: "en" }).language).toBe("en");
    expect(() =>
      updateLanguageSchema.parse({ language: "en", locale: "en-US" })
    ).toThrow();
  });

  it("createApiKeySchema: accepts { provider, key, label }, rejects unknown", () => {
    expect(
      createApiKeySchema.parse({ provider: "anthropic", key: "sk-ant-x" }).provider
    ).toBe("anthropic");
    expect(() =>
      createApiKeySchema.parse({
        provider: "anthropic",
        key: "sk-ant-x",
        isDefault: true, // read-only server-derived field — must not be settable
      })
    ).toThrow();
  });

  it("writingGoalSchema: accepts { type, target }, rejects unknown", () => {
    expect(writingGoalSchema.parse({ type: "daily", target: 500 }).target).toBe(500);
    expect(() =>
      writingGoalSchema.parse({ type: "daily", target: 500, bookId: "b1" })
    ).toThrow();
  });

  it("exportConfigUpdateSchema: accepts a partial section, rejects unknown top-level key", () => {
    expect(
      exportConfigUpdateSchema.parse({ sceneBreakGlyph: "* * *" }).sceneBreakGlyph
    ).toBe("* * *");
    expect(() =>
      exportConfigUpdateSchema.parse({ sceneBreakGlyph: "* * *", bogus: 1 })
    ).toThrow();
  });
});

// ─── Client-facing error detail surfaces the offending key ───────
// Routes render strict failures through the shared zodErrorResponse helper.
// An unrecognized-key issue sits at the object root, so it surfaces in
// formErrors (never fieldErrors); an ordinary field issue surfaces in
// fieldErrors keyed by the field path.

describe("zodErrorDetails surfaces the offending key (D-39)", () => {
  it("names the unknown key in formErrors for an unrecognized-key failure", () => {
    const res = updateLanguageSchema.safeParse({ language: "en", locale: "x" });
    expect(res.success).toBe(false);
    if (!res.success) {
      const details = zodErrorDetails(res.error);
      expect(details.formErrors.join(" ")).toContain("locale");
    }
  });

  it("names the field in fieldErrors for an ordinary validation failure", () => {
    const res = updateLanguageSchema.safeParse({ language: "x" }); // too short
    expect(res.success).toBe(false);
    if (!res.success) {
      const details = zodErrorDetails(res.error);
      expect(Object.keys(details.fieldErrors)).toContain("language");
    }
  });
});

// ─── Route-level proof for the route-local default-model schema ───

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: { user: { update: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { PATCH as defaultModelPATCH } from "@/app/api/settings/default-model/route";

function patchReq(body: unknown) {
  return new Request("http://t/api/settings/default-model", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings/default-model rejects unknown keys (D-39)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireUser.mockResolvedValue({ id: "u1" });
  });

  it("400s an unknown key and never touches the DB", async () => {
    const res = await defaultModelPATCH(
      patchReq({ defaultModel: "anthropic/sonnet", theme: "dark" }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // The offending key is surfaced (root-level → formErrors), not silently dropped.
    expect(JSON.stringify(body)).toContain("theme");
    expect(h.db.user.update).not.toHaveBeenCalled();
  });

  it("still accepts a valid { defaultModel } payload", async () => {
    h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
    const res = await defaultModelPATCH(
      patchReq({ defaultModel: "anthropic/sonnet" }) as never
    );
    expect(res.status).toBe(200);
    expect(h.db.user.update).toHaveBeenCalledTimes(1);
  });
});
