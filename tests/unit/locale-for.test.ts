import { describe, it, expect } from "vitest";

import { localeFor } from "@/lib/i18n/ui-strings";

describe("localeFor", () => {
  it("maps every supported UI language code to its BCP-47 locale tag", () => {
    expect(localeFor("en")).toBe("en-US");
    expect(localeFor("sr")).toBe("sr-RS");
    expect(localeFor("de")).toBe("de-DE");
    expect(localeFor("es")).toBe("es-ES");
    expect(localeFor("fr")).toBe("fr-FR");
    expect(localeFor("ru")).toBe("ru-RU");
    expect(localeFor("zh")).toBe("zh-CN");
  });

  it("falls back to en-US for unsupported codes", () => {
    expect(localeFor("xx")).toBe("en-US");
    expect(localeFor("")).toBe("en-US");
    expect(localeFor("it")).toBe("en-US");
  });

  it("strips a region suffix and maps the base language", () => {
    expect(localeFor("en-GB")).toBe("en-US");
    expect(localeFor("de-AT")).toBe("de-DE");
    expect(localeFor("zh-Hant")).toBe("zh-CN");
  });
});
