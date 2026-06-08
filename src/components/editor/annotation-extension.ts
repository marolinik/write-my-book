/**
 * TipTap extension that renders inline annotation decorations.
 *
 * Annotations are ProseMirror Decorations (not Marks), so they overlay
 * the document without modifying its content. Annotations are derived
 * from editorial findings — each finding with an `originalText` gets
 * highlighted in the editor.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

// ── Types ──────────────────────────────────────────────────────

export type AnnotationType = "insert" | "delete" | "comment" | "ai" | "finding" | "severity-high" | "severity-medium" | "severity-low";

export interface AnnotationItem {
  id: string;
  type: AnnotationType;
  /** Text to search for in the document. */
  text: string;
  description: string;
  findingId?: string;
}

export type AnnotationCounts = Record<string, number>;

// ── CSS class map ──────────────────────────────────────────────

const TYPE_CLASSES: Record<AnnotationType, string> = {
  insert: "anno-insert",
  delete: "anno-delete",
  comment: "anno-comment",
  ai: "anno-ai",
  finding: "anno-finding",
  "severity-high": "anno-severity-high",
  "severity-medium": "anno-severity-medium",
  "severity-low": "anno-severity-low",
};

// ── Text search ────────────────────────────────────────────────

/**
 * Find all occurrences of `search` in the document, returning
 * absolute ProseMirror positions.
 */
export function findTextPositions(
  doc: PMNode,
  search: string
): { from: number; to: number }[] {
  const results: { from: number; to: number }[] = [];
  const needle = search.trim();
  if (!needle) return results;

  const needleLower = needle.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const blockText = node.textContent;
    const blockLower = blockText.toLowerCase();
    let idx = blockLower.indexOf(needleLower);
    while (idx !== -1) {
      // pos is the position of the textblock node itself.
      // +1 skips the opening token to reach the first character.
      results.push({
        from: pos + 1 + idx,
        to: pos + 1 + idx + needle.length,
      });
      idx = blockLower.indexOf(needleLower, idx + 1);
    }
  });

  // If no exact match found, try matching the first ~40 characters as a prefix.
  // After edits, the original text may have changed but the beginning is often intact.
  if (results.length === 0 && needle.length > 40) {
    const prefix = needle.substring(0, 40).toLowerCase();
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const blockLower = node.textContent.toLowerCase();
      const idx = blockLower.indexOf(prefix);
      if (idx !== -1) {
        results.push({
          from: pos + 1 + idx,
          to: pos + 1 + idx + Math.min(needle.length, node.textContent.length - idx),
        });
      }
    });
  }

  return results;
}

// ── Decoration builder ─────────────────────────────────────────

function buildDecorations(
  doc: PMNode,
  annotations: AnnotationItem[]
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const anno of annotations) {
    const positions = findTextPositions(doc, anno.text);
    // Take only the first match to avoid false duplicates.
    const match = positions[0];
    if (!match) continue;

    decorations.push(
      Decoration.inline(match.from, match.to, {
        class: TYPE_CLASSES[anno.type],
        "data-annotation-id": anno.id,
        "data-annotation-type": anno.type,
        "data-finding-id": anno.findingId ?? "",
      })
    );
  }

  return DecorationSet.create(doc, decorations);
}

// ── Plugin key ─────────────────────────────────────────────────

export const annotationPluginKey = new PluginKey("annotations");

// ── Extension options ──────────────────────────────────────────

export interface AnnotationExtensionOptions {
  onAnnotationClick?: (
    annotationIds: string[],
    annotationTypes: AnnotationType[],
    rect: DOMRect,
    event: MouseEvent
  ) => void;
}

// ── TipTap Extension ───────────────────────────────────────────

export const AnnotationExtension =
  Extension.create<AnnotationExtensionOptions>({
    name: "annotations",

    addOptions() {
      return { onAnnotationClick: undefined };
    },

    addStorage() {
      return {
        annotations: [] as AnnotationItem[],
        enabled: true,
      };
    },

    addProseMirrorPlugins() {
      const extension = this;

      return [
        new Plugin({
          key: annotationPluginKey,

          state: {
            init(_, state) {
              if (!extension.storage.enabled) return DecorationSet.empty;
              return buildDecorations(state.doc, extension.storage.annotations);
            },

            apply(tr, old, _, newState) {
              if (!extension.storage.enabled) return DecorationSet.empty;

              const meta = tr.getMeta(annotationPluginKey);
              if (meta?.annotations !== undefined) {
                extension.storage.annotations = meta.annotations;
                return buildDecorations(newState.doc, meta.annotations);
              }
              if (meta?.enabled !== undefined) {
                extension.storage.enabled = meta.enabled;
                if (!meta.enabled) return DecorationSet.empty;
                return buildDecorations(
                  newState.doc,
                  extension.storage.annotations
                );
              }
              if (tr.docChanged) {
                return buildDecorations(
                  newState.doc,
                  extension.storage.annotations
                );
              }
              return old;
            },
          },

          props: {
            decorations(state) {
              return annotationPluginKey.getState(state);
            },

            handleClick(view, _pos, event) {
              const target = event.target as HTMLElement;
              const annoEl = target.closest(
                "[data-annotation-id]"
              ) as HTMLElement | null;
              if (!annoEl) return false;

              if (!extension.options.onAnnotationClick) return false;

              // Detect all overlapping annotation spans at the click position
              // using elementsFromPoint to find annotations layered at the same spot
              const elementsAtPoint = document.elementsFromPoint(
                event.clientX,
                event.clientY
              );
              const annotationIds: string[] = [];
              const annotationTypes: AnnotationType[] = [];
              const seenIds = new Set<string>();

              for (const el of elementsAtPoint) {
                const id = el.getAttribute("data-annotation-id");
                const type = el.getAttribute("data-annotation-type") as AnnotationType;
                if (id && !seenIds.has(id)) {
                  seenIds.add(id);
                  annotationIds.push(id);
                  annotationTypes.push(type);
                }
              }

              // Fallback: if elementsFromPoint missed the clicked element, ensure it's included
              const clickedId = annoEl.getAttribute("data-annotation-id");
              const clickedType = annoEl.getAttribute("data-annotation-type") as AnnotationType;
              if (clickedId && !seenIds.has(clickedId)) {
                annotationIds.unshift(clickedId);
                annotationTypes.unshift(clickedType);
              }

              if (annotationIds.length > 0) {
                const rect = annoEl.getBoundingClientRect();
                extension.options.onAnnotationClick(
                  annotationIds,
                  annotationTypes,
                  rect,
                  event
                );
                return true;
              }
              return false;
            },
          },
        }),
      ];
    },
  });

// ── Helpers ────────────────────────────────────────────────────

/** Count annotations by type. */
export function countAnnotations(
  annotations: AnnotationItem[]
): AnnotationCounts {
  const counts: AnnotationCounts = {};
  for (const a of annotations) {
    counts[a.type] = (counts[a.type] ?? 0) + 1;
  }
  return counts;
}
