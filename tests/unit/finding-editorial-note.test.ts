/**
 * A replacement is prose, never a memo about prose.
 *
 * On the owner's chapter 31 an auto-applied continuity fix pasted this into
 * the manuscript: "…nosio taj poziv kao pretnju. [Napomena: u Bibliju priče
 * upisati „taj poziv" kao postojeći element iz 3.17…]". The editor's
 * instruction to the writer rode in `newText`, and applying it wrote the
 * instruction into the book.
 *
 * Novels almost never use square brackets, and a replacement that ADDS a
 * bracketed span the original did not have is carrying a note, in any
 * language. One the original already had is the writer's own.
 */

import { describe, it, expect } from "vitest";
import { addedEditorialNote } from "@/lib/editorial/finding-applicability";

const CH31_BEFORE = "Aleksandar je nedeljama nosio taj poziv kao pretnju.";
const CH31_AFTER =
  "Aleksandar je nedeljama nosio taj poziv kao pretnju. [Napomena: u Bibliju priče upisati „taj poziv\" kao postojeći element iz 3.17 (propušten poziv zabeležen na Aleksandrovom telefonu) kako bi se pratilo da se ovde poziva na već uspostavljen trag.]";

describe("addedEditorialNote", () => {
  it("catches the memo that was written into chapter 31", () => {
    expect(addedEditorialNote(CH31_BEFORE, CH31_AFTER)).toMatch(/^\[Napomena:/);
  });

  it("catches it in any language", () => {
    expect(addedEditorialNote("He left.", "He left. [Note: add this to the story bible]")).not.toBeNull();
    expect(addedEditorialNote("Il partit.", "[À vérifier avec l'architecture] Il partit.")).not.toBeNull();
  });

  it("leaves a bracket the writer already had alone", () => {
    const own = "Pisalo je: [nečitko] i ništa više.";
    expect(addedEditorialNote(own, "Pisalo je samo: [nečitko].")).toBeNull();
  });

  it("leaves ordinary prose alone", () => {
    expect(addedEditorialNote("Otišao je.", "Otišao je bez reči, kao i uvek.")).toBeNull();
    expect(addedEditorialNote(null, "Nova rečenica.")).toBeNull();
    expect(addedEditorialNote("x", null)).toBeNull();
  });
});
