import { describe, it, expect } from "vitest";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

// D-135: the BYOK trust-panel copy (settings.byokDescription) hardcoded the
// phrase "You pay Anthropic directly for token usage" in every locale. The
// product is BYOK across many providers (a persona whose only key is an
// OpenRouter key never pays Anthropic), so naming one specific provider in the
// generic trust copy is wrong for every non-Anthropic user. The provider clause
// must be provider-neutral ("your AI provider") in all seven UI locales.
//
// The generic empty-state prompt (agentPanel.apiKeyDescription) renders with no
// provider object bound (isIdle && !hasApiKey, generic "Go to Settings" link),
// so it is a generic surface and is neutralised the same way. The per-provider
// blurbs (settings.providerBlurbs.anthropic etc.) are correctly provider-scoped
// and are intentionally NOT asserted here.

// Specific provider brand names that must never appear on a generic BYOK surface.
const PROVIDER_NAMES = ["Anthropic", "OpenAI", "OpenRouter", "Google"] as const;

const UI_DICTIONARY_CODES = UI_SUPPORTED_LANGUAGES.map((lang) => lang.code);

function namesFoundIn(text: string): string[] {
  const lower = text.toLowerCase();
  return PROVIDER_NAMES.filter((name) => lower.includes(name.toLowerCase()));
}

describe("BYOK trust copy is provider-neutral (D-135)", () => {
  it("covers all seven UI locales", () => {
    expect(UI_DICTIONARY_CODES).toEqual(["en", "sr", "de", "es", "fr", "ru", "zh"]);
  });

  it.each(UI_DICTIONARY_CODES)(
    "%s settings.byokDescription names no specific provider",
    (code) => {
      const text = getUIStrings(code).settings.byokDescription;
      expect(text).toBeTruthy();
      expect(namesFoundIn(text)).toEqual([]);
    }
  );

  it.each(UI_DICTIONARY_CODES)(
    "%s agentPanel.apiKeyDescription (generic surface) names no specific provider",
    (code) => {
      const text = getUIStrings(code).agentPanel.apiKeyDescription;
      expect(text).toBeTruthy();
      expect(namesFoundIn(text)).toEqual([]);
    }
  );
});
