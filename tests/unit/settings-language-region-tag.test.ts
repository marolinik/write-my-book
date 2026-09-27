import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-S22 — PATCH /api/settings/language accepted "sr-RS" (its base tag has a
 * dictionary) and stored it raw. The preference also seeds the New Book
 * language picker, whose options are BOOK_LANGUAGES codes only, so the picker
 * rendered empty and "Start writing" answered 400 "Invalid input". A region
 * tag is stored as the dictionary code it resolves to; a row stored raw before
 * this fix is read back the same way. The 400 for an unsupported code also
 * promised "You can still write books in this language" for codes no book can
 * be written in ("hr", "xx").
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET, PATCH } from "@/app/api/settings/language/route";
import { normalizeUiLanguage } from "@/lib/i18n/ui-strings";

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

describe("normalizeUiLanguage", () => {
  it("maps a code to the dictionary it resolves to, or null", () => {
    expect(normalizeUiLanguage("sr")).toBe("sr");
    expect(normalizeUiLanguage("sr-RS")).toBe("sr");
    expect(normalizeUiLanguage("fr-CA")).toBe("fr");
    expect(normalizeUiLanguage("hr")).toBeNull();
    expect(normalizeUiLanguage("toString")).toBeNull();
  });
});

describe("PATCH /api/settings/language stores a supported code, never a region tag", () => {
  it("'sr-RS' is stored and answered as 'sr'", async () => {
    const res = await PATCH(req({ language: "sr-RS" }) as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ language: "sr" });
    expect(h.db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { preferredLanguage: "sr" },
    });
  });

  it("'fr-CA' is stored as 'fr'", async () => {
    await PATCH(req({ language: "fr-CA" }) as never);
    expect(h.db.user.update.mock.calls[0][0].data.preferredLanguage).toBe("fr");
  });

  it("'hr' is refused without promising a book language that does not exist", async () => {
    const res = await PATCH(req({ language: "hr" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/not yet available/i);
    expect(String(body.error)).not.toMatch(/write books in this language/i);
    expect(h.db.user.update).not.toHaveBeenCalled();
  });

  it("'ar' (a book language without a UI dictionary) still points to the book picker", async () => {
    const res = await PATCH(req({ language: "ar" }) as never);
    expect(res.status).toBe(400);
    expect(String((await res.json()).error)).toMatch(/write books in this language/i);
  });
});

describe("GET /api/settings/language reads an old raw region tag as its dictionary code", () => {
  it("a stored 'sr-RS' is answered as 'sr'", async () => {
    h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage: "sr-RS" });
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ language: "sr" });
  });

  it("a stored code without a dictionary is returned as is", async () => {
    h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage: "ar" });
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ language: "ar" });
  });

  it("no stored preference is English", async () => {
    h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage: null });
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ language: "en" });
  });
});
