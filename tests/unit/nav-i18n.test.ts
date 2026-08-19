import { describe, it, expect } from "vitest";
import { getUIStrings } from "@/lib/i18n/ui-strings";

// D-11: the mobile bottom-nav labels (Home/Books/Agent/Settings) were hardcoded
// English and never translated. They now route through t.nav.* (commit 5a3fa02);
// every UI dictionary must supply them. This mirrors provider-card-i18n.test.ts.
//
// The same test also guards the two i18n residuals flagged in the P5 axe/i18n
// sweep: the "sessions" usage-unit word (api-keys-section) and the writing-agent
// FAB tooltip ("Open Writing Agent"). Both must exist and be non-empty in every
// locale. Unsupported locales (e.g. "ar") falling back to English is EXPECTED,
// not a bug — asserted explicitly below.

const UI_CODES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;
const NON_EN = ["sr", "de", "es", "fr", "ru", "zh"] as const;

describe("D-11 mobile bottom-nav labels are translated in every locale", () => {
  it.each(UI_CODES)("%s supplies non-empty nav labels", (code) => {
    const nav = getUIStrings(code).nav;
    expect(nav.home).toBeTruthy();
    expect(nav.books).toBeTruthy();
    expect(nav.agent).toBeTruthy();
    expect(nav.settings).toBeTruthy();
  });

  it("non-English locales actually translate home/books/settings", () => {
    const en = getUIStrings("en").nav;
    for (const code of NON_EN) {
      const nav = getUIStrings(code).nav;
      expect(nav.home).not.toBe(en.home);
      expect(nav.books).not.toBe(en.books);
      expect(nav.settings).not.toBe(en.settings);
    }
  });

  it("unsupported locale (ar) falls back to English nav labels", () => {
    expect(getUIStrings("ar").nav.home).toBe("Home");
    expect(getUIStrings("ar").nav.settings).toBe("Settings");
  });
});

describe("i18n residuals: sessions unit word + writing-agent FAB tooltip", () => {
  it.each(UI_CODES)("%s supplies a non-empty sessions unit word", (code) => {
    expect(getUIStrings(code).settings.sessionsUnit).toBeTruthy();
  });

  it.each(UI_CODES)("%s supplies a non-empty 'open agent' tooltip", (code) => {
    expect(getUIStrings(code).header.openAgent).toBeTruthy();
  });

  it("distinct-script locales translate the residual strings", () => {
    // Loanword locales (fr "sessions") may coincide with English, so only the
    // locales that must visibly differ are asserted.
    const en = getUIStrings("en");
    for (const code of ["de", "ru", "zh"] as const) {
      expect(getUIStrings(code).settings.sessionsUnit).not.toBe(
        en.settings.sessionsUnit
      );
      expect(getUIStrings(code).header.openAgent).not.toBe(
        en.header.openAgent
      );
    }
  });

  it("unsupported locale falls back to English residual strings", () => {
    expect(getUIStrings("ar").settings.sessionsUnit).toBe(
      getUIStrings("en").settings.sessionsUnit
    );
    expect(getUIStrings("ar").header.openAgent).toBe(
      getUIStrings("en").header.openAgent
    );
  });
});
