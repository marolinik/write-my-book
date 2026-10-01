/**
 * Taking a scene out of the editor for Polish Scene, and putting the chosen
 * rewrite back. Runs in the browser.
 *
 * The range is widened to whole top-level blocks: a drag that starts or ends
 * mid-paragraph would otherwise leave orphan fragments around the rewrite.
 * The scene travels as markdown, so italics, bold and scene breaks (horizontal
 * rules) reach the model and come back as formatting instead of being dropped
 * by a plain-text round trip.
 */

import type { Editor } from "@tiptap/core";
import { POLISH_CONTEXT_CHARS } from "./limits";

export interface SceneRange {
  from: number;
  to: number;
  /** The scene as markdown: what the model reads and what must still be there on accept. */
  markdown: string;
  contextBefore: string;
  contextAfter: string;
}

interface MarkdownStorage {
  serializer?: { serialize: (content: unknown) => string };
}

function markdownStorage(editor: Editor): MarkdownStorage | undefined {
  return (editor.storage as unknown as { markdown?: MarkdownStorage }).markdown;
}

/** The blocks between `from` and `to` as markdown (plain paragraphs without the markdown extension). */
function rangeMarkdown(editor: Editor, from: number, to: number): string {
  const serializer = markdownStorage(editor)?.serializer;
  if (!serializer) return editor.state.doc.textBetween(from, to, "\n\n").trim();
  const { doc, schema } = editor.state;
  const fragment = schema.topNodeType.create(null, doc.slice(from, to).content);
  return serializer.serialize(fragment).trim();
}

/** The selection widened to the whole top-level blocks it covers. */
function blockBounds(editor: Editor): { from: number; to: number } {
  const { selection, doc } = editor.state;
  const { $from, $to } = selection;
  if ($from.depth < 1 || $to.depth < 1) return { from: selection.from, to: selection.to };

  // A drag that starts at the very end of a block, or ends at the very start
  // of one, did not mean to include that block.
  const startsAtBlockEnd =
    $from.parentOffset === $from.parent.content.size && selection.from < selection.to;
  const endsAtBlockStart = $to.parentOffset === 0 && selection.to > selection.from;

  const from = startsAtBlockEnd ? $from.after(1) : $from.before(1);
  const to = endsAtBlockStart ? $to.before(1) : $to.after(1);
  if (from >= to) return { from: $from.before(1), to: $from.after(1) };
  return { from, to: Math.min(to, doc.content.size) };
}

export function captureSceneRange(editor: Editor): SceneRange {
  const { from, to } = blockBounds(editor);
  const doc = editor.state.doc;
  return {
    from,
    to,
    markdown: rangeMarkdown(editor, from, to),
    contextBefore: doc.textBetween(Math.max(0, from - POLISH_CONTEXT_CHARS), from, "\n"),
    contextAfter: doc.textBetween(to, Math.min(doc.content.size, to + POLISH_CONTEXT_CHARS), "\n"),
  };
}

function paragraphNodes(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }));
}

/**
 * Replace the captured range with the rewrite, as one undoable step. Refuses
 * ("changed") when the range no longer holds the scene that was sent: a
 * rewrite of old text must never overwrite what the writer typed since.
 */
export function applySceneRewrite(
  editor: Editor,
  range: SceneRange,
  rewrite: string
): "applied" | "changed" {
  const size = editor.state.doc.content.size;
  if (range.to > size || rangeMarkdown(editor, range.from, range.to) !== range.markdown) {
    return "changed";
  }
  // With the markdown extension, insertContentAt parses a string as markdown.
  const content = markdownStorage(editor)?.serializer ? rewrite : paragraphNodes(rewrite);
  editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, content)
    .run();
  return "applied";
}
