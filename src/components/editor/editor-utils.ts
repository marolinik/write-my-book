import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Focus from "@tiptap/extension-focus";
import { Markdown } from "tiptap-markdown";
import { AnnotationExtension, findTextPositions } from "./annotation-extension";
import type { AnnotationItem, AnnotationType } from "./annotation-extension";
import type { FindingItem } from "@/hooks/use-editorial";

// ── Markdown extraction ──────────────────────────────────────

export function getMarkdownFromEditor(editor: Editor | null): string {
  if (!editor) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor.storage as any).markdown?.getMarkdown?.() ?? "";
}

// ── Unicode sanitization (client mirror) ─────────────────────

/**
 * Client mirror of the content route's sanitizeUnicode (U+FFFD replacement
 * char → U+2014 em dash). GET and 409 bodies are sanitized server-side, so
 * every client-side content-equality check must compare symmetric strings.
 * Single shared copy — equality semantics drifting between call sites would
 * silently break no-op-conflict adoption and draft recovery.
 */
export function sanitizeUnicode(text: string): string {
  return text.replace(/�/g, "—");
}

// ── Editor content attributes (shared across all TipTap sites) ──

/** Single source of truth for the editor column measure (was inlined 5×). */
export const EDITOR_MEASURE_CLASS = "max-w-[680px]";

/**
 * ProseMirror contenteditable attributes shared by every editor instance
 * (chapter editor, documents page, immersive mode). `w-full` lets the column
 * fill phone viewports — the measure cap is unchanged on desktop. The
 * `tiptap` and conditional `focus-mode` tokens are load-bearing: globals.css
 * and the focus-mode styling key off them.
 */
export function getEditorContentAttributes(
  focusMode: boolean,
  label: string
): Record<string, string> {
  return {
    class: `tiptap ${EDITOR_MEASURE_CLASS} w-full mx-auto px-4 sm:px-6 ${focusMode ? "focus-mode" : ""}`,
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": label,
  };
}

// ── Responsive breakpoint ────────────────────────────────────

const LG_BREAKPOINT = 1024;

export function useIsLg() {
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = () => setIsLg(mql.matches);
    mql.addEventListener("change", onChange);
    setIsLg(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isLg;
}

// ── Severity → annotation type mapping ───────────────────────

/** Map DB severity values to display-level annotation types (color-coded underlines). */
export function mapSeverityToClass(severity: string): AnnotationType {
  switch (severity) {
    case "critical":
    case "major":
      return "severity-high"; // red
    case "moderate":
      return "severity-medium"; // orange
    case "minor":
    default:
      return "severity-low"; // blue
  }
}

// ── Findings → annotation conversion ─────────────────────────

export function findingsToAnnotations(findings: FindingItem[]): AnnotationItem[] {
  const annotations: AnnotationItem[] = [];

  for (const f of findings) {
    if (f.status === "dismissed") continue;

    if (f.originalText) {
      // Both auto-appliable (has newText) and text-only findings use severity coloring
      annotations.push({
        id: `finding-${f.id}`,
        type: mapSeverityToClass(f.severity),
        text: f.originalText,
        description: f.description,
        findingId: f.id,
      });
    }
    // Note: locationStart is metadata (e.g. "paragraph 3"), not literal
    // document text, so we don't create annotations from it — they would
    // never match anything in the editor and show as phantom highlights.
  }

  return annotations;
}

// ── Tooltip state type ───────────────────────────────────────

export interface TooltipState {
  annotationId: string;
  annotationType: AnnotationType;
  rect: DOMRect;
  finding: FindingItem | null;
}

// ── Editor extensions factory ────────────────────────────────

export function createEditorExtensions(options: {
  placeholder?: string;
  onAnnotationClick?: (ids: string[], types: AnnotationType[], rect: DOMRect, event: MouseEvent) => void;
}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    Placeholder.configure({
      placeholder: options.placeholder ?? "Start writing...",
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Focus.configure({
      className: "has-focus",
      mode: "shallowest",
    }),
    Markdown.configure({
      html: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
    AnnotationExtension.configure({
      onAnnotationClick: options.onAnnotationClick,
    }),
  ];
}

// ── Stale finding detection ──────────────────────────────────

/**
 * Classify each finding as "fresh" (text still in doc), "stale" (text changed),
 * or "unanchored" (no originalText to anchor to).
 */
export function classifyFindingFreshness(
  findings: FindingItem[],
  doc: PMNode
): Map<string, "fresh" | "stale" | "unanchored"> {
  const result = new Map<string, "fresh" | "stale" | "unanchored">();
  for (const f of findings) {
    if (!f.originalText) {
      result.set(f.id, "unanchored");
      continue;
    }
    const positions = findTextPositions(doc, f.originalText);
    result.set(f.id, positions.length > 0 ? "fresh" : "stale");
  }
  return result;
}
