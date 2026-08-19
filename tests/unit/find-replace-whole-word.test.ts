import { describe, it, expect } from "vitest";
import {
  findInText,
  replaceInText,
  isWordLikeQuery,
} from "@/lib/search/find-replace";

/**
 * D-189 — Find & Replace had no whole-word option, so a book-wide character
 * rename corrupted ordinary prose and reported the corruptions as successes.
 *
 * Measured on camera (2-chapter fixture, `Sam` a character, `same`/`sample`/
 * `samples`/`samovar` ordinary words): wanted 6, replaced 17, 11 collateral
 * word corruptions (`Maxe`×8, `Maxple`, `Maxples`, `Maxovar`). The same
 * mechanism produced 4,617 `[[REPLACED]]` markers on the campaign's P2
 * fixture (`them` → `[[REPLACED]]m`, `together` → `toge[[REPLACED]]r`).
 *
 * Contract locked here: word-boundary matching that is unicode-aware (the
 * fixture is full of Zürich/Łódź/Kőszeg) and escape-safe (the query is never
 * compiled into a regex — the scan stays indexOf + boundary test).
 */

const PROSE =
  "Sam saw the same sample of samples. The samovar hissed. Sam's coat. SAM shouted. Not-Sam either.";

describe("D-189 whole-word matching", () => {
  it("RED: substring matching corrupts ordinary words (the captured defect)", () => {
    const loose = replaceInText(PROSE, "Sam", "Max", false, false);
    // Pre-fix behaviour, kept as the contrast case: every `sam` inside a
    // longer word is rewritten and the caller is told it succeeded.
    expect(loose.result).toContain("Maxe");
    expect(loose.result).toContain("Maxple");
    expect(loose.result).toContain("Maxovar");
  });

  it("whole-word replace renames only the character", () => {
    const r = replaceInText(PROSE, "Sam", "Max", false, true);
    // Sam, Sam's, SAM, Not-Sam → 4 standalone words (case-insensitive).
    expect(r.count).toBe(4);
    expect(r.result).not.toContain("Maxe");
    expect(r.result).not.toContain("Maxple");
    expect(r.result).not.toContain("Maxovar");
    expect(r.result).toContain("the same sample of samples");
    expect(r.result).toContain("The samovar hissed");
    expect(r.result).toContain("Max's coat");
    expect(r.result).toContain("Not-Max either");
  });

  it("whole-word find counts only standalone occurrences", () => {
    expect(findInText(PROSE, "Sam", false, true).count).toBe(4);
    expect(findInText(PROSE, "Sam", true, true).count).toBe(3); // SAM excluded
    // Snippets still carry the ORIGINAL casing of each match.
    expect(findInText(PROSE, "sam", false, true).snippets[0].match).toBe("Sam");
  });

  it("is unicode-aware: accented and non-ASCII letters are word characters", () => {
    const text = "Zürich and Zürichs, Łódź and Łódźer, Kőszeg and Kőszegi.";
    expect(replaceInText(text, "Zürich", "Bern", false, true).count).toBe(1);
    expect(replaceInText(text, "Łódź", "Lodz", false, true).count).toBe(1);
    expect(replaceInText(text, "Kőszeg", "Eger", false, true).count).toBe(1);
    // The inflected forms survive untouched.
    const r = replaceInText(text, "Zürich", "Bern", false, true);
    expect(r.result).toContain("Zürichs");
    expect(r.result).toContain("Bern and Zürichs");
  });

  it("digits and underscores count as word characters (no mid-token cuts)", () => {
    expect(replaceInText("ch1 ch12 ch1_b ch1", "ch1", "X", true, true).count).toBe(
      2
    );
  });

  it("the last occurrence at end-of-text still matches", () => {
    expect(findInText("a Sam", "Sam", true, true).count).toBe(1);
    expect(findInText("Sam", "Sam", true, true).count).toBe(1);
  });

  it("is escape-safe: regex metacharacters in the query are literal", () => {
    const text = "cost (net) and cost (net)ish plus a.b and axb";
    expect(replaceInText(text, "(net)", "[gross]", true, true).count).toBe(1);
    // "a.b" must not match "axb" — the query is never compiled to a regex.
    expect(replaceInText(text, "a.b", "Q", true, true).count).toBe(1);
  });

  it("defaults stay substring-matching for existing callers", () => {
    // 4-arg call sites (the pre-D-189 signature) keep their old behaviour.
    expect(replaceInText(PROSE, "Sam", "Max", false).result).toContain("Maxe");
    expect(findInText(PROSE, "Sam", false).count).toBe(8);
  });

  it("isWordLikeQuery gates the UI toggle", () => {
    expect(isWordLikeQuery("Sam")).toBe(true);
    expect(isWordLikeQuery("Zürich")).toBe(true);
    expect(isWordLikeQuery("Sam's")).toBe(true);
    expect(isWordLikeQuery("chapter one")).toBe(true);
    // Nothing word-like at either edge → whole-word matching is meaningless
    // (it would silently return zero matches), so the UI must not offer it.
    expect(isWordLikeQuery("—")).toBe(false);
    expect(isWordLikeQuery(" the ")).toBe(false);
    expect(isWordLikeQuery("...")).toBe(false);
    expect(isWordLikeQuery("")).toBe(false);
  });

  it("a non-word-like query under whole-word finds nothing (documented edge)", () => {
    // Belt and braces for the gate above: if a caller forces wholeWord on a
    // padded query, it must fail closed (no matches) rather than corrupt prose.
    expect(findInText("in the cat", " the ", false, true).count).toBe(0);
  });
});
