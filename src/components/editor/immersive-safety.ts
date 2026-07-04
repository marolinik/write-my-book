/**
 * Safety helpers for immersive focus mode (S10 — production-readiness audit).
 *
 * (a) sanitizeImmersiveHtml: a minimal, dependency-free constraint on the HTML
 *     injected via dangerouslySetInnerHTML into the contentEditable. This is
 *     defense-in-depth against self-injection (single-author threat model),
 *     NOT a complete sanitizer — a real DOMPurify/allowlist pass is a
 *     follow-up (no HTML sanitizer is currently installed and this unit must
 *     not add a dependency). It strips the script/style/embedded-frame
 *     elements, inline event-handler attributes, and javascript: URIs that a
 *     stored TipTap document should never legitimately contain, while leaving
 *     the formatting markup (h1/h2/p/em/strong/…) untouched so immersive
 *     rendering is unaffected.
 *
 * (b) registerImmersiveFlushGuards: mirrors use-draft-buffer.ts's unload flush
 *     — persist pending immersive edits on visibilitychange:hidden and
 *     pagehide. visibilitychange:hidden always precedes pagehide on tab close,
 *     so routing the immersive buffer into the editor there means the draft
 *     buffer's own pagehide flush then reads the fresh content: the two
 *     listeners compose to close the loss window that otherwise spanned up to
 *     the parent's 30s periodic sync.
 */

// <script>…</script>, <style>…</style>, <iframe>…</iframe>, etc. (paired).
const DANGEROUS_PAIRED_ELEMENT =
  /<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
// Void/unclosed variants of the same dangerous elements.
const DANGEROUS_VOID_ELEMENT =
  /<\s*(?:iframe|object|embed|link|meta|base|source|param|script|style)\b[^>]*>/gi;
// Inline event handlers: onclick="…", onerror='…', onload=…
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// javascript: URIs on href/src/xlink:href.
const JS_URI_ATTR =
  /\s(?:href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi;

export function sanitizeImmersiveHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(DANGEROUS_PAIRED_ELEMENT, "")
    .replace(DANGEROUS_VOID_ELEMENT, "")
    .replace(EVENT_HANDLER_ATTR, "")
    .replace(JS_URI_ATTR, "");
}

interface FlushEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface FlushGuardTargets {
  win: FlushEventTarget;
  doc: FlushEventTarget & { readonly visibilityState: DocumentVisibilityState };
}

/**
 * Wire best-effort unload guards that call `flush` on pagehide and on
 * visibilitychange when the document becomes hidden. Returns a cleanup that
 * removes both listeners. Targets are injectable for testing; they default to
 * the DOM globals in the browser.
 */
export function registerImmersiveFlushGuards(
  flush: () => void,
  targets?: FlushGuardTargets
): () => void {
  const win = targets?.win ?? window;
  const doc = targets?.doc ?? document;

  const onPageHide = () => flush();
  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") flush();
  };

  win.addEventListener("pagehide", onPageHide);
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    win.removeEventListener("pagehide", onPageHide);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
