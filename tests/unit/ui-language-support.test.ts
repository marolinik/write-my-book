import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  UI_SUPPORTED_LANGUAGES,
  isUiLanguageSupported,
  getUIStrings,
} from "@/lib/i18n/ui-strings";

// D-12: PATCH /api/settings/language returned 200 for "ar" while the UI
// silently fell back to 100% English — no Arabic dictionary exists (nor does
// RTL). The interface-language surface (picker + API) must only accept
// languages with a real dictionary; the full SUPPORTED_LANGUAGES list remains
// valid for book/prose language.

describe("UI language support mapping (D-12)", () => {
  it("every UI-supported language resolves to a real, distinct dictionary", () => {
    expect(UI_SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
    const en = getUIStrings("en");
    for (const lang of UI_SUPPORTED_LANGUAGES) {
      const dict = getUIStrings(lang.code);
      expect(dict.settings.title).toBeTruthy();
      if (lang.code !== "en") {
        // A genuinely translated dictionary, not the English fallback object.
        expect(dict).not.toBe(en);
      }
    }
  });

  it("UI-supported languages are a strict subset of book languages", () => {
    const bookCodes = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
    for (const lang of UI_SUPPORTED_LANGUAGES) {
      expect(bookCodes.has(lang.code)).toBe(true);
    }
    // ar stays available as a BOOK language — only the UI surface rejects it.
    expect(bookCodes.has("ar")).toBe(true);
    expect(UI_SUPPORTED_LANGUAGES.some((l) => l.code === "ar")).toBe(false);
  });

  it("isUiLanguageSupported: dictionary-backed codes only, region tags resolve", () => {
    expect(isUiLanguageSupported("en")).toBe(true);
    expect(isUiLanguageSupported("fr")).toBe(true);
    expect(isUiLanguageSupported("fr-CA")).toBe(true);
    expect(isUiLanguageSupported("ar")).toBe(false);
    expect(isUiLanguageSupported("ja")).toBe(false);
    expect(isUiLanguageSupported("xx")).toBe(false);
  });

  it("prototype-chain keys are not treated as dictionaries", () => {
    expect(isUiLanguageSupported("toString")).toBe(false);
    expect(isUiLanguageSupported("constructor")).toBe(false);
    expect(getUIStrings("toString")).toBe(getUIStrings("en"));
  });

  it("getUIStrings('ar') still falls back to English (already-persisted users keep a working UI)", () => {
    expect(getUIStrings("ar")).toBe(getUIStrings("en"));
  });
});

// ─── PATCH /api/settings/language gate ──────────────────────────

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { PATCH } from "@/app/api/settings/language/route";

function req(body: unknown) {
  return new Request("http://t/api/settings/language", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage: "en" });
  h.db.user.update.mockResolvedValue({});
});

describe("PATCH /api/settings/language rejects UI-unsupported languages (D-12)", () => {
  it("'ar' → 400 with an honest not-yet-available error, nothing persisted", async () => {
    const res = await PATCH(req({ language: "ar" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/not yet available/i);
    expect(String(body.error)).toMatch(/interface/i);
    expect(h.db.user.update).not.toHaveBeenCalled();
  });

  it("'fr' → 200 and persists", async () => {
    const res = await PATCH(req({ language: "fr" }) as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ language: "fr" });
    expect(h.db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { preferredLanguage: "fr" },
    });
  });

  it("malformed shape still 400s via schema validation", async () => {
    const res = await PATCH(req({ language: "x" }) as never);
    expect(res.status).toBe(400);
    expect(h.db.user.update).not.toHaveBeenCalled();
  });
});
