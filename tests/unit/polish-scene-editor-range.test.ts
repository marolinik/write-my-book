// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createEditorExtensions, getMarkdownFromEditor } from "@/components/editor/editor-utils";
import { applySceneRewrite, captureSceneRange } from "@/lib/polish/editor-range";

/**
 * Polish Scene takes a range of the manuscript out, sends it to a model and
 * puts a rewrite back. These run on the real editor schema, because the
 * failures live there: a range cut mid-paragraph leaves orphan fragments, and
 * a plain-text round trip deletes scene breaks and every italic.
 */

let editor: Editor | null = null;

function makeEditor(markdown: string): Editor {
  editor = new Editor({ extensions: createEditorExtensions({}), content: markdown });
  return editor;
}

/** Position of the first character of `needle` in the document text. */
function posOf(ed: Editor, needle: string): number {
  let found = -1;
  ed.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const idx = node.text!.indexOf(needle);
    if (idx >= 0) found = pos + idx;
    return false;
  });
  if (found < 0) throw new Error(`not found: ${needle}`);
  return found;
}

function select(ed: Editor, from: number, to: number) {
  ed.commands.setTextSelection({ from, to });
}

function countNodes(ed: Editor, type: string): number {
  let n = 0;
  ed.state.doc.descendants((node) => {
    if (node.type.name === type) n += 1;
  });
  return n;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("captureSceneRange", () => {
  it("widens a selection cut mid-paragraph to the whole paragraphs it touches", () => {
    const ed = makeEditor("Before.\n\nAlpha one.\n\nBeta two.\n\nAfter.");
    select(ed, posOf(ed, "one."), posOf(ed, " two."));
    const range = captureSceneRange(ed);
    expect(range.markdown).toBe("Alpha one.\n\nBeta two.");
  });

  it("does not pull in the next paragraph when the drag ends at its very start", () => {
    const ed = makeEditor("Alpha one.\n\nBeta two.\n\nAfter.");
    select(ed, posOf(ed, "Alpha"), posOf(ed, "Beta"));
    expect(captureSceneRange(ed).markdown).toBe("Alpha one.");
  });

  it("keeps italics, bold and the scene break in what the model reads", () => {
    const ed = makeEditor("*She knew.* It was **over**.\n\n---\n\nNext scene.");
    select(ed, posOf(ed, "She"), posOf(ed, "scene.") + 6);
    const { markdown } = captureSceneRange(ed);
    expect(markdown).toContain("*She knew.*");
    expect(markdown).toContain("**over**");
    expect(markdown).toContain("---");
  });

  it("gives the model the text on both sides of the scene", () => {
    const ed = makeEditor("Before.\n\nAlpha one.\n\nAfter.");
    select(ed, posOf(ed, "Alpha"), posOf(ed, "one.") + 4);
    const range = captureSceneRange(ed);
    expect(range.contextBefore).toContain("Before.");
    expect(range.contextAfter).toContain("After.");
  });
});

describe("applySceneRewrite", () => {
  it("replaces exactly the paragraphs of the scene, leaving no fragments", () => {
    const ed = makeEditor("Before.\n\nAlpha one.\n\nBeta two.\n\nAfter.");
    select(ed, posOf(ed, "one."), posOf(ed, " two."));
    const range = captureSceneRange(ed);
    expect(applySceneRewrite(ed, range, "New A.\n\nNew B.")).toBe("applied");
    expect(getMarkdownFromEditor(ed)).toBe("Before.\n\nNew A.\n\nNew B.\n\nAfter.");
  });

  it("replaces a one-paragraph scene with a one-paragraph rewrite", () => {
    const ed = makeEditor("Before.\n\nAlpha one.\n\nAfter.");
    select(ed, posOf(ed, "Alpha"), posOf(ed, "one.") + 4);
    const range = captureSceneRange(ed);
    expect(applySceneRewrite(ed, range, "Alpha, rewritten.")).toBe("applied");
    expect(getMarkdownFromEditor(ed)).toBe("Before.\n\nAlpha, rewritten.\n\nAfter.");
  });

  it("puts italics and the scene break back as editor formatting, not as asterisks", () => {
    const ed = makeEditor("*She knew.*\n\n---\n\nNext scene.");
    select(ed, posOf(ed, "She"), posOf(ed, "scene.") + 6);
    const range = captureSceneRange(ed);
    applySceneRewrite(ed, range, "*She knew it.*\n\n---\n\nThe next scene.");
    expect(countNodes(ed, "horizontalRule")).toBe(1);
    expect(getMarkdownFromEditor(ed)).toContain("*She knew it.*");
    expect(ed.state.doc.textContent).not.toContain("*");
  });

  it("refuses when the scene changed after it was sent, and leaves the manuscript alone", () => {
    const ed = makeEditor("Before.\n\nAlpha one.\n\nAfter.");
    select(ed, posOf(ed, "Alpha"), posOf(ed, "one.") + 4);
    const range = captureSceneRange(ed);
    ed.commands.insertContentAt(posOf(ed, "one."), "brave ");
    const before = getMarkdownFromEditor(ed);
    expect(applySceneRewrite(ed, range, "Rewritten.")).toBe("changed");
    expect(getMarkdownFromEditor(ed)).toBe(before);
  });
});
