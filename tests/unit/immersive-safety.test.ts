import { describe, it, expect, vi } from "vitest";

import {
  sanitizeImmersiveHtml,
  registerImmersiveFlushGuards,
} from "@/components/editor/immersive-safety";

describe("sanitizeImmersiveHtml — S10 defense-in-depth", () => {
  it("preserves the formatting markup immersive mode renders", () => {
    const html =
      "<h1>Chapter</h1><h2>Scene</h2><p>She <em>ran</em> and <strong>fell</strong>.</p>";
    // Formatting must survive untouched — sanitizing must not degrade UX.
    expect(sanitizeImmersiveHtml(html)).toBe(html);
  });

  it("strips <script> elements", () => {
    const out = sanitizeImmersiveHtml(
      "<p>ok</p><script>alert(1)</script><p>done</p>"
    );
    expect(out).not.toMatch(/script/i);
    expect(out).toContain("<p>ok</p>");
    expect(out).toContain("<p>done</p>");
  });

  it("strips <iframe> / <style> embedded elements", () => {
    const out = sanitizeImmersiveHtml(
      "<p>a</p><iframe src='evil'></iframe><style>*{}</style>"
    );
    expect(out).not.toMatch(/iframe/i);
    expect(out).not.toMatch(/<style/i);
    expect(out).toContain("<p>a</p>");
  });

  it("strips inline event-handler attributes", () => {
    const out = sanitizeImmersiveHtml(
      `<p onclick="steal()">x</p><img src=x onerror='hack()'>`
    );
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/onerror/i);
    // The benign element/text is retained.
    expect(out).toContain("x");
  });

  it("strips javascript: URIs on href/src", () => {
    const out = sanitizeImmersiveHtml(
      `<a href="javascript:evil()">link</a>`
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain("link");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeImmersiveHtml("")).toBe("");
  });
});

/** Minimal EventTarget-like double that records handlers by event type. */
function makeTarget(visibilityState: DocumentVisibilityState = "visible") {
  const handlers = new Map<string, () => void>();
  return {
    visibilityState,
    added: [] as string[],
    removed: [] as string[],
    addEventListener(type: string, listener: () => void) {
      handlers.set(type, listener);
      this.added.push(type);
    },
    removeEventListener(type: string, listener: () => void) {
      if (handlers.get(type) === listener) handlers.delete(type);
      this.removed.push(type);
    },
    fire(type: string) {
      handlers.get(type)?.();
    },
  };
}

describe("registerImmersiveFlushGuards — S10 unload flush", () => {
  it("registers pagehide + visibilitychange and cleans both up", () => {
    const win = makeTarget();
    const doc = makeTarget();
    const cleanup = registerImmersiveFlushGuards(vi.fn(), { win, doc });

    expect(win.added).toContain("pagehide");
    expect(doc.added).toContain("visibilitychange");

    cleanup();
    expect(win.removed).toContain("pagehide");
    expect(doc.removed).toContain("visibilitychange");
  });

  it("flushes on pagehide", () => {
    const flush = vi.fn();
    const win = makeTarget();
    const doc = makeTarget();
    registerImmersiveFlushGuards(flush, { win, doc });

    win.fire("pagehide");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes on visibilitychange only when the document is hidden", () => {
    const flush = vi.fn();
    const win = makeTarget();
    const doc = makeTarget("visible");
    registerImmersiveFlushGuards(flush, { win, doc });

    // Still visible: no flush.
    doc.fire("visibilitychange");
    expect(flush).not.toHaveBeenCalled();

    // Now hidden: flush.
    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not flush after cleanup removes the listeners", () => {
    const flush = vi.fn();
    const win = makeTarget();
    const doc = makeTarget("hidden");
    const cleanup = registerImmersiveFlushGuards(flush, { win, doc });
    cleanup();

    // Handlers were removed, so firing is a no-op.
    win.fire("pagehide");
    doc.fire("visibilitychange");
    expect(flush).not.toHaveBeenCalled();
  });
});
