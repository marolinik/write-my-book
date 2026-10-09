import { describe, it, expect } from "vitest";
import { enforceBookScript, hasStrayCjk, stripStrayCjk } from "@/lib/agents/serbian-script";
import { settleRewrite } from "@/lib/structure/rewrite-prompt";
import { settlePolishedText } from "@/lib/polish/polish-scene";

/**
 * The local model sometimes leaks Chinese characters into a Serbian sentence
 * (live, 2026-10-09: "Na makro平面u, knjiga ima dva ritma"). In a book that is
 * not Chinese, Japanese or Korean, a stray leak is removed from what the model
 * writes; a draft of the writer's prose that carries one is refused instead,
 * because cutting characters out of a word leaves a broken word.
 */

describe("stripStrayCjk", () => {
  it("removes a leak from a Serbian sentence", () => {
    expect(stripStrayCjk("Na makro平面u, knjiga ima dva ritma.", "sr")).toBe("Na makrou, knjiga ima dva ritma.");
  });

  it("removes a leaked word with its CJK punctuation", () => {
    expect(stripStrayCjk("Poglavlje je 结构。 predugo.", "sr")).toBe("Poglavlje je predugo.");
  });

  it("leaves a Chinese, Japanese or Korean book alone", () => {
    expect(stripStrayCjk("第 15 章太长。", "zh")).toBe("第 15 章太长。");
    expect(stripStrayCjk("これは章です。", "ja")).toBe("これは章です。");
  });

  it("keeps a deliberate passage, not a leak", () => {
    const quote = "Na zidu je pisalo: 春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。 Stajao je dugo pred natpisom.";
    expect(stripStrayCjk(quote, "sr")).toBe(quote);
  });

  it("strips a streamed chunk that is only the leak", () => {
    expect(stripStrayCjk("平面", "sr")).toBe("");
  });

  it("never touches Cyrillic, Latin diacritics or typographic quotes", () => {
    const t = "„Ćao“, rekla je — «да» i ’ovo’.";
    expect(stripStrayCjk(t, "ru")).toBe(t);
  });
});

describe("enforceBookScript strips leaks in every non-CJK language", () => {
  it("in Serbian, after transliterating", () => {
    expect(enforceBookScript("Глава 平面 је дуга.", "sr")).toBe("Glava je duga.");
  });

  it("in English", () => {
    expect(enforceBookScript("The macro平面 view.", "en")).toBe("The macro view.");
  });
});

describe("hasStrayCjk", () => {
  it("flags a leak in a non-CJK book and nothing in a CJK one", () => {
    expect(hasStrayCjk("makro平面u", "sr")).toBe(true);
    expect(hasStrayCjk("makroplanu", "sr")).toBe(false);
    expect(hasStrayCjk("平面", "zh")).toBe(false);
  });
});

describe("drafts of the writer's prose refuse a leak instead of mangling a word", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `reč${i}`).join(" ");

  it("a trim draft", () => {
    const draft = `${words(700)} makro平面u`;
    const r = settleRewrite(draft, "end_turn", {
      kind: "trim",
      original: words(1000),
      originalWords: 1000,
      targetWords: 700,
      language: "sr",
    });
    expect(r).toEqual({ ok: false, reason: "foreign-script" });
  });

  it("a Polish Scene rewrite", () => {
    const original = "Mara je stajala na prozoru i brojala svetla u luci, jedno po jedno.";
    const r = settlePolishedText("Mara je stajala na prozoru 平面 i brojala svetla u luci.", "end_turn", original, "sr");
    expect(r).toEqual({ ok: false, reason: "foreign-script" });
  });

  it("a draft in a Chinese book is judged as before", () => {
    const original = "她站在窗前，一盏一盏地数着港口的灯。她想起父亲教她的方法。";
    const r = settlePolishedText("她站在窗前，数着港口的灯，一盏接一盏。她想起父亲教她的方法。", "end_turn", original, "zh");
    expect(r.ok).toBe(true);
  });
});
