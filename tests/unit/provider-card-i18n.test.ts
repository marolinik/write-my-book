import { describe, it, expect } from "vitest";
import { getUIStrings } from "@/lib/i18n/ui-strings";

// D-51: the provider key-management card (onboarding + settings) hardcoded its
// buttons/labels ("Add Key", "Get key", "Validate & Save", "Replace", "Remove",
// the label placeholder) and the provider blurbs in English for every locale.
// They now route through t.settings.*; every UI dictionary must supply them.
//
// COST_HINTS stays English on purpose — those are pricing claims deferred to a
// human pass (see sweep53 report), so they are intentionally NOT asserted here.

const UI_DICTIONARY_CODES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;
const PROVIDER_KEYS = ["anthropic", "openrouter", "openai", "gemini", "grok"] as const;

describe("provider-card labels are translated (D-51)", () => {
  it.each(UI_DICTIONARY_CODES)(
    "%s provides non-empty provider-card action labels",
    (code) => {
      const s = getUIStrings(code).settings;
      expect(s.getKey).toBeTruthy();
      expect(s.validateAndSave).toBeTruthy();
      expect(s.replace).toBeTruthy();
      expect(s.remove).toBeTruthy();
      expect(s.labelPlaceholder).toBeTruthy();
      expect(s.usageSummary).toBeTruthy();
      expect(s.noUsageYet).toBeTruthy();
    }
  );

  it.each(UI_DICTIONARY_CODES)(
    "%s provides a non-empty blurb for every provider",
    (code) => {
      const blurbs = getUIStrings(code).settings.providerBlurbs;
      for (const key of PROVIDER_KEYS) {
        expect(blurbs[key]).toBeTruthy();
      }
    }
  );

  it("non-English locales actually translate the action labels", () => {
    for (const code of ["sr", "de", "es", "fr", "ru", "zh"]) {
      const s = getUIStrings(code).settings;
      const en = getUIStrings("en").settings;
      expect(s.getKey).not.toBe(en.getKey);
      expect(s.remove).not.toBe(en.remove);
      expect(s.replace).not.toBe(en.replace);
    }
  });

  it("provider blurbs keep model names verbatim across every locale", () => {
    for (const code of UI_DICTIONARY_CODES) {
      const blurbs = getUIStrings(code).settings.providerBlurbs;
      expect(blurbs.anthropic).toContain("Claude");
      expect(blurbs.openrouter).toContain("200");
      expect(blurbs.openai).toContain("GPT-4o");
      expect(blurbs.gemini).toContain("Gemini");
      expect(blurbs.grok).toContain("Grok-4");
    }
  });

  it("unknown locale falls back to English labels", () => {
    expect(getUIStrings("xx").settings.getKey).toBe("Get key");
    expect(getUIStrings("xx").settings.remove).toBe("Remove");
  });
});
