/**
 * A Serbian book is set to Latin script, and the prompt demands it in capitals.
 * Local models drift into Cyrillic anyway — mid-session, mid-document — so the
 * writer gets text in a script they did not choose. Transliteration at the
 * boundary is the only guarantee that does not depend on model behaviour.
 */

import { describe, it, expect } from "vitest";
import {
  containsCyrillic,
  toSerbianLatin,
  enforceBookScript,
} from "@/lib/agents/serbian-script";

describe("Serbian Cyrillic to Latin", () => {
  it("converts the sentence the agent actually produced", () => {
    expect(toSerbianLatin("Почетак рада — write-synopsis")).toBe(
      "Početak rada — write-synopsis",
    );
    expect(
      toSerbianLatin("Прво читам постојећу грађу у пројекту"),
    ).toBe("Prvo čitam postojeću građu u projektu");
  });

  it("handles the three digraph letters", () => {
    expect(toSerbianLatin("љубав")).toBe("ljubav");
    expect(toSerbianLatin("њен")).toBe("njen");
    expect(toSerbianLatin("џеп")).toBe("džep");
  });

  it("gets digraph casing right", () => {
    // Capitalised word: title form.
    expect(toSerbianLatin("Његов")).toBe("Njegov");
    // All-caps run: all-caps digraph.
    expect(toSerbianLatin("ЊЕГОВ")).toBe("NJEGOV");
    expect(toSerbianLatin("ЏЕП")).toBe("DŽEP");
  });

  it("leaves Latin, punctuation and markdown alone", () => {
    const md = "## Poglavlje 1\n\n**bold** — `code` | table |";
    expect(toSerbianLatin(md)).toBe(md);
  });

  it("converts only the Cyrillic parts of mixed text", () => {
    expect(toSerbianLatin("Agent каже: WriteDocument")).toBe(
      "Agent kaže: WriteDocument",
    );
  });

  it("detects Cyrillic", () => {
    expect(containsCyrillic("Почетак")).toBe(true);
    expect(containsCyrillic("Pocetak")).toBe(false);
  });

  it("enforces the script only for Serbian", () => {
    const cyrillic = "Његов";
    expect(enforceBookScript(cyrillic, "sr")).toBe("Njegov");
    // Russian is Cyrillic by right — never touch it.
    expect(enforceBookScript("Его книга", "ru")).toBe("Его книга");
    expect(enforceBookScript(cyrillic, undefined)).toBe(cyrillic);
  });
});
