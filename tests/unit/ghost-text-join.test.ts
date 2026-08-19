import { describe, it, expect } from "vitest";
import { joinGhostSuggestion } from "@/components/editor/ghost-text-join";

/**
 * D-130 — ghost Tab-accept inserted the raw suggestion at the cursor, so a
 * suggestion starting with a word char glued onto the word being typed:
 * typed "…wrote about the" + suggestion "dream: …" → "thedream: …" in the doc
 * (phone capture 07-phone-ghost-accepted-tab.png, bytes verified via DOM).
 *
 * joinGhostSuggestion(before, suggestion) decides whether the insert needs a
 * separating space. `before` is up to the LAST TWO doc characters before the
 * cursor ("" at doc/paragraph start — ProseMirror textBetween across the node
 * boundary yields ""). The second char disambiguates a trailing quote: an
 * apostrophe / opening quote glues, while a closing quote after sentence
 * punctuation starts a new sentence and needs a leading space. One-char callers
 * stay valid (the second-to-last char is treated as absent).
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

  it("binds a suggestion-initial straight apostrophe to the prior word (defect #1)", () => {
    expect(joinGhostSuggestion("r", "'s edge")).toBe("'s edge");
  });

  it("glues after a trailing straight apostrophe preceded by a letter", () => {
    expect(joinGhostSuggestion("n'", "t stop")).toBe("t stop");
    expect(joinGhostSuggestion("e'", "re here")).toBe("re here");
  });

  it("glues after a curly right single quote used as an apostrophe (defect #2)", () => {
    expect(joinGhostSuggestion("n’", "t stop")).toBe("t stop");
    // A lone quote (second-to-last char absent) stays apostrophe-glued.
    expect(joinGhostSuggestion("’", "s")).toBe("s");
  });

  it("adds a space when a closing quote follows sentence punctuation (defect #3)", () => {
    expect(joinGhostSuggestion('."', "The morning came.")).toBe(
      " The morning came."
    );
    expect(joinGhostSuggestion(".”", "She turned away.")).toBe(
      " She turned away."
    );
  });

  it("treats an opening double quote after a space as an opening quote (glue)", () => {
    expect(joinGhostSuggestion(' "', "Hello")).toBe("Hello");
  });

  it("returns an empty suggestion unchanged", () => {
    expect(joinGhostSuggestion("e", "")).toBe("");
  });
});
