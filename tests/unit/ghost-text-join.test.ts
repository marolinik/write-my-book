import { describe, it, expect } from "vitest";
import { joinGhostSuggestion } from "@/components/editor/ghost-text-join";

/**
 * D-130 — ghost Tab-accept inserted the raw suggestion at the cursor, so a
 * suggestion starting with a word char glued onto the word being typed:
 * typed "…wrote about the" + suggestion "dream: …" → "thedream: …" in the doc
 * (phone capture 07-phone-ghost-accepted-tab.png, bytes verified via DOM).
 *
 * joinGhostSuggestion(charBefore, suggestion) decides whether the insert needs
 * a separating space. charBefore is the single doc character before the cursor
 * ("" at doc/paragraph start — ProseMirror textBetween across the node
 * boundary yields "").
 */
describe("joinGhostSuggestion — D-130 word-join corruption", () => {
  it("prepends a space when a word character follows a word character (the live D-130 repro)", () => {
    expect(joinGhostSuggestion("e", "dream: the desk was a ship")).toBe(
      " dream: the desk was a ship"
    );
  });

  it("does not add a space when the char before the cursor is a space", () => {
    expect(joinGhostSuggestion(" ", "door.")).toBe("door.");
  });

  it("does not add a space when the char before the cursor is a newline", () => {
    expect(joinGhostSuggestion("\n", "The morning came.")).toBe(
      "The morning came."
    );
  });

  it("does not add a space at doc/paragraph start (empty charBefore)", () => {
    expect(joinGhostSuggestion("", "The morning came.")).toBe(
      "The morning came."
    );
  });

  it("does not add a space when the suggestion already starts with whitespace", () => {
    expect(joinGhostSuggestion("e", " dream")).toBe(" dream");
  });

  it("does not add a space when the suggestion starts with punctuation that binds left", () => {
    expect(joinGhostSuggestion("e", ", and the words were its wake")).toBe(
      ", and the words were its wake"
    );
    expect(joinGhostSuggestion("e", ". The morning came.")).toBe(
      ". The morning came."
    );
    expect(joinGhostSuggestion("g", "!")).toBe("!");
    expect(joinGhostSuggestion("e", "?")).toBe("?");
    expect(joinGhostSuggestion("e", ") and then")).toBe(") and then");
  });

  it("does not add a space after an opening bracket or dash", () => {
    expect(joinGhostSuggestion("(", "dream")).toBe("dream");
    expect(joinGhostSuggestion("—", "dream")).toBe("dream");
    expect(joinGhostSuggestion("-", "known")).toBe("known");
  });

  it("does not add a space after a quote character (mid-word apostrophes and open quotes)", () => {
    expect(joinGhostSuggestion("'", "t stop")).toBe("t stop");
    expect(joinGhostSuggestion('"', "Hello")).toBe("Hello");
    expect(joinGhostSuggestion("“", "Hello")).toBe("Hello");
  });

  it("returns an empty suggestion unchanged", () => {
    expect(joinGhostSuggestion("e", "")).toBe("");
  });
});
