// P1-26: server error bodies and hook fallbacks reached the writer in English
// on every failure path, whatever the interface language. Failures now carry a
// stable code (or at least a status), and one helper turns that into the
// dictionary sentence for the writer's language; the English `error` text
// stays in the body for logs and is never shown.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { ApiError } from "@/lib/api-client";
import { describeApiError, apiFailure } from "@/lib/api/describe-api-error";
import { API_ERROR_CODES } from "@/lib/api/error-codes";

const sr = getUIStrings("sr");
const en = getUIStrings("en");
const UI_LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;

describe("describeApiError", () => {
  it("maps a known code to the writer's language, never the English error", () => {
    const err = new ApiError("Assistant is still answering", 409, { error: "Assistant is still answering", code: "TURN_IN_PROGRESS" });
    expect(describeApiError(err, sr)).toBe(sr.apiErrors.TURN_IN_PROGRESS);
    expect(describeApiError(err, sr)).not.toContain("Assistant");
  });

  it.each([
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
    [503, "SERVICE_UNAVAILABLE"],
    [502, "SERVICE_UNAVAILABLE"],
    [404, "NOT_FOUND"],
    [400, "INVALID_REQUEST"],
    [500, "SERVER_ERROR"],
  ] as const)("falls back to the status family for %i", (status, code) => {
    expect(describeApiError(new ApiError("English text", status, { error: "English text" }), sr)).toBe(sr.apiErrors[code]);
  });

  it("names a plan limit as a plan limit, not as rate limiting", () => {
    const body = { error: "Free tier limit reached", upgradeToTier: "PRO" };
    expect(describeApiError(new ApiError("x", 429, body), sr)).toBe(sr.apiErrors.PLAN_LIMIT);
  });

  it("an unknown code falls back to its status; a bare error to the generic sentence; a failed fetch to the network one", () => {
    expect(describeApiError(new ApiError("x", 429, { code: "SOMETHING_NEW" }), sr)).toBe(sr.apiErrors.RATE_LIMITED);
    expect(describeApiError(new Error("boom"), sr)).toBe(sr.apiErrors.GENERIC);
    expect(describeApiError(new TypeError("Failed to fetch"), sr)).toBe(sr.apiErrors.NETWORK);
    expect(describeApiError({ status: 413, body: {} }, sr)).toBe(sr.apiErrors.TOO_LARGE);
  });

  it("apiFailure builds an ApiError whose message is already localized", () => {
    const err = apiFailure(429, { error: "Too many uploads", code: "RATE_LIMITED" }, sr);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe(sr.apiErrors.RATE_LIMITED);
    expect(err.status).toBe(429);
  });
});

describe("the dictionaries", () => {
  it.each(UI_LANGUAGES)("%s has a sentence for every code", (lang) => {
    const t = getUIStrings(lang);
    for (const code of API_ERROR_CODES) expect(t.apiErrors[code], `${lang}.${code}`).toBeTruthy();
  });

  it("the translations are not English copies", () => {
    for (const lang of UI_LANGUAGES.filter((l) => l !== "en")) {
      const t = getUIStrings(lang);
      const same = API_ERROR_CODES.filter((c) => t.apiErrors[c] === en.apiErrors[c]);
      expect(same, lang).toEqual([]);
    }
  });
});

describe("the hooks", () => {
  const dir = join(__dirname, "..", "..", "src", "hooks");
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));

  it("throw no English prose to the writer", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf-8");
      const lines = src.split(/\r?\n/);
      lines.forEach((line, i) => {
        // `throw new Error("Failed to …")`, `|| "Failed to …"`, `?? "Request failed"` reaching a toast.
        if (/new Error\(\s*(?:[\w.?]+\s*(?:\|\||\?\?)\s*)?["'`][A-Z][a-z]+ [a-z]/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

// Review I-1 (Wave 4): hooks that had already said the failure in the writer's
// language threw a plain Error, and describeApiError turned it into "Something
// went wrong" (the missing-prerequisite line under the agent panel, the Free
// indexing gate, the last-API-key refusal).
describe("a sentence the hook already localized", () => {
  it("is shown as it is", async () => {
    const { LocalizedError } = await import("@/lib/api/describe-api-error");
    expect(describeApiError(new LocalizedError("Nedostaje biblija priče."), sr)).toBe("Nedostaje biblija priče.");
  });

  it("the api-key refusals carry codes with their own sentence", () => {
    expect(describeApiError(new ApiError("x", 400, { code: "LAST_API_KEY" }), sr)).toBe(sr.apiErrors.LAST_API_KEY);
    expect(describeApiError(new ApiError("x", 409, { code: "KEY_IN_USE" }), sr)).toBe(sr.apiErrors.KEY_IN_USE);
    const route = readFileSync(join(__dirname, "..", "..", "src", "app", "api", "settings", "api-keys", "[id]", "route.ts"), "utf-8");
    expect(route).toContain('code: "LAST_API_KEY"');
    expect(route).toContain('code: "KEY_IN_USE"');
  });

  it("no hook throws a translated or server sentence as a plain Error", () => {
    const dir = join(__dirname, "..", "..", "src", "hooks");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
      readFileSync(join(dir, file), "utf-8").split(/\r?\n/).forEach((line, i) => {
        if (/new Error\(\s*(?:t\.|notice\.|err\.error|body\.error|"SETUP_INCOMPLETE")/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
