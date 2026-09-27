import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

/**
 * The i18n guards scan src/app and src/components, so a toast fired from a
 * hook in src/hooks was never seen: twelve of them still spoke English to a
 * Serbian writer ("API key deleted", "Style profile saved", ...). Hooks read
 * the dictionary like everything else now, and this keeps the next hand from
 * typing the message inline again.
 */

const HOOKS_DIR = join(process.cwd(), "src/hooks");
const LITERAL_TOAST = /toast\.(?:success|error|info|warning|message)\(\s*["'`]/;

const HOOK_TOAST_KEYS = [
  "completeSetupFirst",
  "apiKeySaved",
  "apiKeyDeleted",
  "billingPortalFailed",
  "defaultModelUpdated",
  "languageUpdateFailed",
  "memoryIndexRebuilt",
  "bookMemoryCleared",
  "styleProfileSaved",
  "characterLensCreated",
  "characterLensUpdated",
  "characterLensDeleted",
] as const;

describe("hooks fire toasts from the dictionary", () => {
  const hookFiles = readdirSync(HOOKS_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

  it("scans the hooks that exist", () => {
    expect(hookFiles.length).toBeGreaterThan(5);
  });

  for (const file of hookFiles) {
    it(`${file} has no inline English toast`, () => {
      const lines = readFileSync(join(HOOKS_DIR, file), "utf8").split(/\r?\n/);
      const offenders = lines
        .map((line, i) => (LITERAL_TOAST.test(line) ? `${i + 1}: ${line.trim()}` : null))
        .filter(Boolean);
      expect(offenders).toEqual([]);
    });
  }

  it("every UI locale translates the hook toasts", () => {
    const english = getUIStrings("en").toasts as Record<string, string>;
    for (const lang of UI_SUPPORTED_LANGUAGES) {
      const toasts = getUIStrings(lang.code).toasts as Record<string, string>;
      for (const key of HOOK_TOAST_KEYS) {
        expect(toasts[key], `${lang.code}.toasts.${key}`).toBeTruthy();
        if (lang.code !== "en") {
          expect(toasts[key], `${lang.code}.toasts.${key} is still English`).not.toBe(english[key]);
        }
      }
    }
  });
});
