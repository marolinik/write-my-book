import { describe, it, expect } from "vitest";
import {
  findInText,
  replaceInText,
  MAX_SNIPPETS,
} from "@/lib/search/find-replace";

describe("findInText", () => {
  it("case-insensitive by default", () => {
    const r = findInText("The Cat sat. the cat ran.", "cat", false);
    expect(r.count).toBe(2);
    expect(r.snippets[0].match).toBe("Cat"); // original casing preserved
    expect(r.snippets[1].match).toBe("cat");
  });

  it("case-sensitive when asked", () => {
    const r = findInText("Cat cat CAT", "cat", true);
    expect(r.count).toBe(1);
    expect(r.snippets[0].match).toBe("cat");
  });

  it("counts non-overlapping matches (aa in aaaa = 2)", () => {
    expect(findInText("aaaa", "aa", true).count).toBe(2);
  });

  it("caps snippets at MAX_SNIPPETS but keeps counting", () => {
    const r = findInText("x ".repeat(10).trim(), "x", true);
    expect(r.count).toBe(10);
    expect(r.snippets).toHaveLength(MAX_SNIPPETS);
  });

  it("captures ±context in before/after", () => {
    const r = findInText("hello NAME world", "NAME", true);
    expect(r.snippets[0].before).toBe("hello ");
    expect(r.snippets[0].after).toBe(" world");
  });

  it("no matches → empty", () => {
    expect(findInText("abc", "zzz", false)).toEqual({ count: 0, snippets: [] });
  });
});

describe("replaceInText", () => {
  it("replaces all occurrences, preserving surrounding text", () => {
    const r = replaceInText("Bob went. Bob left.", "Bob", "Alice", false);
    expect(r.count).toBe(2);
    expect(r.result).toBe("Alice went. Alice left.");
  });

  it("case-insensitive match inserts replacement verbatim", () => {
    const r = replaceInText("Bob BOB bob", "bob", "Al", false);
    expect(r.count).toBe(3);
    expect(r.result).toBe("Al Al Al");
  });

  it("case-sensitive skips non-matching casings", () => {
    const r = replaceInText("Bob BOB bob", "Bob", "Al", true);
    expect(r.count).toBe(1);
    expect(r.result).toBe("Al BOB bob");
  });

  it("supports deletion (empty replacement)", () => {
    const r = replaceInText("a-b-c", "-", "", true);
    expect(r.count).toBe(2);
    expect(r.result).toBe("abc");
  });

  it("no matches → content unchanged, count 0", () => {
    expect(replaceInText("abc", "zzz", "q", false)).toEqual({
      count: 0,
      result: "abc",
    });
  });
});
