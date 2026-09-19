import { describe, it, expect } from "vitest";
import {
  scanDocumentContent,
  regenerationWorkflowFor,
} from "@/lib/documents/damage-scan";

/**
 * O3 — documents written before the encoding and language fixes still carry
 * their damage. U+FFFD cannot be reversed (the original bytes are gone), so
 * those documents have to be regenerated rather than repaired. The writer had
 * no way to see which ones, or what would rebuild each.
 */

describe("scanDocumentContent", () => {
  it("reports a clean document as undamaged", () => {
    const out = scanDocumentContent("# Biblija priče\n\nMarko je stajao pred kućom.", "sr");
    expect(out.damaged).toBe(false);
    expect(out.reasons).toEqual([]);
  });

  it("flags replacement characters as unrecoverable", () => {
    const out = scanDocumentContent("Marko je stajao pred ku��om.", "sr");
    expect(out.damaged).toBe(true);
    expect(out.reasons).toContain("replacement_chars");
    expect(out.recoverable).toBe(false);
  });

  it("flags double-encoded Latin-1 runs", () => {
    // "kućom" encoded as UTF-8 then decoded as Latin-1.
    const out = scanDocumentContent("Marko je stajao pred kuÄom.", "sr");
    expect(out.damaged).toBe(true);
    expect(out.reasons).toContain("double_encoded");
  });

  it("flags a Serbian book's document written in English", () => {
    const out = scanDocumentContent(
      "# Story Bible\n\nThe protagonist is a man who must choose between the truth and his family.",
      "sr"
    );
    expect(out.damaged).toBe(true);
    expect(out.reasons).toContain("wrong_language");
  });

  it("does not call a Serbian document English because of a few loanwords", () => {
    const out = scanDocumentContent(
      "# Biblija priče\n\nMarko je stajao pred kućom koja nije bila njegova, ali je morao da uđe " +
        "jer je pismo koje je dobio govorilo da treba da zna istinu o ocu.",
      "sr"
    );
    expect(out.damaged).toBe(false);
  });

  it("flags an empty document, which is a failed write rather than a short one", () => {
    expect(scanDocumentContent("   \n\n", "sr").reasons).toContain("empty");
    expect(scanDocumentContent("", "en").damaged).toBe(true);
  });

  it("never claims wrong language for a language it cannot judge", () => {
    const out = scanDocumentContent("Some plain English text about the story.", "ja");
    expect(out.reasons).not.toContain("wrong_language");
  });

  it("collects every reason, not just the first", () => {
    const out = scanDocumentContent(
      "The protagonist must choose between the truth and his family, and the " +
        "story that follows is about ku�om and the chapters that come after it.",
      "sr"
    );
    expect(out.reasons.length).toBeGreaterThan(1);
  });
});

describe("regenerationWorkflowFor", () => {
  it("names the workflow that rebuilds each document type", () => {
    expect(regenerationWorkflowFor("STORY_BIBLE")).toBe("create-story-bible");
    expect(regenerationWorkflowFor("ARCHITECTURE")).toBe("build-architecture");
    expect(regenerationWorkflowFor("FINGERPRINT")).toBe("capture-style");
    expect(regenerationWorkflowFor("SYNOPSIS")).toBe("write-synopsis");
    expect(regenerationWorkflowFor("ANALYSIS_REPORT")).toBe("analyze");
  });

  it("returns null for a document the writer wrote by hand", () => {
    // Chapter prose is the writer's own work: nothing may offer to regenerate it.
    expect(regenerationWorkflowFor("CHAPTER_CONTENT")).toBeNull();
    expect(regenerationWorkflowFor("FREEWRITE")).toBeNull();
  });
});

describe("a series document built by the old composer", () => {
  /**
   * S3-20: the owner's series fingerprint, architecture and bible each held
   * three `# ` headings — one for the series and one per book, because the old
   * composer spliced each book's document in verbatim under a "## Book NN
   * Contributions" heading and never demoted its title. O2 fixed the composer;
   * nothing told him the documents on his shelf predated the fix, so he read
   * the old output and concluded the feature was still broken.
   *
   * A second top-level heading is the signature, and it is one he can confirm
   * by looking — the bar every rule in this scan has to clear.
   */
  it("is flagged when it carries more than one top-level heading", () => {
    const stitched = [
      "# Series FINGERPRINT",
      "## Book 02 Contributions",
      "# OTISAK GLASA",
      "## 1. STRUKTURA REČENICE",
      "## Book 03 Contributions",
      "# OTISAK GLASA (FINGERPRINT)",
    ].join("\n\n");

    const report = scanDocumentContent(stitched, "sr");
    expect(report.damaged).toBe(true);
    expect(report.reasons).toContain("stitched");
  });

  it("leaves a properly composed document alone", () => {
    const composed = [
      "# Series FINGERPRINT",
      "## Book 02 — Legat - Zavet",
      "### 1. STRUKTURA REČENICE",
      "## Book 03 — Legat - Zaveštanje",
      "### 1. STRUKTURA REČENICE",
    ].join("\n\n");

    expect(scanDocumentContent(composed, "sr").reasons).not.toContain("stitched");
  });

  it("leaves an ordinary chapter alone", () => {
    const chapter = "# Poglavlje 1\n\nPrva rečenica.\n\nDruga rečenica.";
    expect(scanDocumentContent(chapter, "sr").reasons).not.toContain("stitched");
  });
});
