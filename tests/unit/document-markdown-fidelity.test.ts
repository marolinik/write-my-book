// @vitest-environment jsdom
/**
 * Documents are round-tripped through the TipTap editor: the agent writes
 * markdown, `setContent` loads it, and `getMarkdownFromEditor` writes it back on
 * every save. Any construct the editor schema does not know is silently
 * FLATTENED and then persisted — the writer loses it permanently.
 *
 * A markdown table without the Table extension collapsed into one run-on
 * paragraph ("ElementDefinition**Genre**Historical thriller..."), which is what
 * the story-bible and voice-fingerprint documents looked like in the app.
 */

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { createEditorExtensions, getMarkdownFromEditor } from "@/components/editor/editor-utils";

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: createEditorExtensions({}),
    content: markdown,
  });
  const out = getMarkdownFromEditor(editor);
  editor.destroy();
  return out;
}

describe("document markdown round-trip", () => {
  it("keeps a table a table", () => {
    const md = [
      "| Element | Definition |",
      "| --- | --- |",
      "| **Genre** | Historical thriller |",
      "| **Tone** | Restrained, tactile |",
    ].join("\n");

    const out = roundTrip(md);
    expect(out).toContain("|");
    expect(out).toMatch(/\|\s*Element\s*\|/);
    expect(out).toMatch(/Historical thriller/);
    // The flattening symptom: header cells fused with no separator.
    expect(out).not.toContain("ElementDefinition");
  });

  it("keeps headings at every level the agents emit", () => {
    const md = "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5";
    const out = roundTrip(md);
    for (const h of ["# H1", "## H2", "### H3", "#### H4", "##### H5"]) {
      expect(out).toContain(h);
    }
  });

  it("keeps lists, quotes, rules and emphasis", () => {
    const md = [
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "> quoted line",
      "",
      "---",
      "",
      "**bold** and *italic* and `code`",
    ].join("\n");

    const out = roundTrip(md);
    expect(out).toContain("- one");
    expect(out).toMatch(/1\.\s+first/);
    expect(out).toContain("> quoted line");
    expect(out).toContain("---");
    expect(out).toContain("**bold**");
    expect(out).toContain("`code`");
  });
});
