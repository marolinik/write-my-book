import { describe, it, expect } from "vitest";
import { getUIStrings } from "@/lib/i18n/ui-strings";

// D-11: the mobile bottom nav hardcoded "Home", "Books", "Agent", "Settings"
// in English for every locale. The labels now come from the nav dictionary —
// every language with a UI dictionary must provide them.

const UI_DICTIONARY_CODES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;

describe("mobile bottom-nav labels are translated (D-11)", () => {
  it.each(UI_DICTIONARY_CODES)(
    "%s provides non-empty home/books/agent/settings labels",
    (code) => {
      const t = getUIStrings(code);
      expect(t.nav.home).toBeTruthy();
      expect(t.nav.agent).toBeTruthy();
      expect(t.nav.books).toBeTruthy();
      expect(t.nav.settings).toBeTruthy();
    }
  );

  it("non-English locales actually translate the Home label", () => {
    expect(getUIStrings("sr").nav.home).toBe("Početna");
    expect(getUIStrings("fr").nav.home).toBe("Accueil");
    expect(getUIStrings("ru").nav.home).toBe("Главная");
    expect(getUIStrings("zh").nav.home).toBe("首页");
    for (const code of ["sr", "de", "es", "fr", "ru", "zh"]) {
      expect(getUIStrings(code).nav.home).not.toBe(getUIStrings("en").nav.home);
    }
  });

  it("agent label matches each dictionary's existing agent terminology", () => {
    // zh uses 代理 elsewhere (代理面板 / 代理会话); es inflects to Agente.
    expect(getUIStrings("zh").nav.agent).toBe("代理");
    expect(getUIStrings("es").nav.agent).toBe("Agente");
    expect(getUIStrings("ru").nav.agent).toBe("Агент");
    expect(getUIStrings("en").nav.agent).toBe("Agent");
  });

  it("unknown locale falls back to English labels", () => {
    expect(getUIStrings("xx").nav.home).toBe("Home");
    expect(getUIStrings("xx").nav.agent).toBe("Agent");
  });
});
