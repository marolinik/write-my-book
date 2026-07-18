// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

import { ImmersiveFocusMode } from "@/components/editor/immersive-focus-mode";

/**
 * D-23 — immersive focus mode intermittently corrupted typed content on a
 * clean Escape exit: a re-render (or remount) of the overlay re-applied the
 * STALE enter-time content snapshot over the live contentEditable DOM,
 * wiping typed words and dropping the caret at position 0 (survivor
 * keystrokes then landed PREPENDED). These tests pin the invariant that the
 * live DOM is never clobbered after mount:
 *
 *  1. a prop change re-supplying a stale snapshot must NOT rewrite the DOM;
 *  2. a remount mid-session must seed from the parent's live buffer
 *     (`liveContentRef`), not the enter-time snapshot;
 *  3. read-path regression: every input reports the current innerHTML;
 *  4. internal re-renders (session timer ticks) never rewrite the DOM;
 *  5. Escape still exits.
 */

const ENTER_SNAPSHOT = "<p>Z14 baseline words.</p>";
const TYPED = "<p>Z14 baseline words. clean-exit-marker</p>";

const noop = (): void => {};

interface RenderOpts {
  content?: string;
  liveContentRef?: { current: string };
  onContentChange?: (html: string) => void;
  onExit?: () => void;
}

function renderOverlay(opts: RenderOpts = {}) {
  const liveContentRef = opts.liveContentRef ?? { current: opts.content ?? ENTER_SNAPSHOT };
  const props = {
    content: opts.content ?? ENTER_SNAPSHOT,
    liveContentRef,
    onContentChange: opts.onContentChange ?? noop,
    onExit: opts.onExit ?? noop,
  };
  const utils = render(<ImmersiveFocusMode {...props} />);
  const editorEl = utils.getByRole("textbox", {
    name: "Distraction-free editor",
  });
  return { ...utils, editorEl, liveContentRef, props };
}

/** Simulate typing the way a contentEditable mutates: DOM first, then input. */
function typeInto(editorEl: HTMLElement, html: string): void {
  editorEl.innerHTML = html;
  fireEvent.input(editorEl);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ImmersiveFocusMode — D-23 live DOM is never clobbered by a stale snapshot", () => {
  it("keeps typed words when a re-render supplies a stale (changed) content snapshot", () => {
    const liveContentRef = { current: ENTER_SNAPSHOT };
    const { editorEl, rerender, props } = renderOverlay({
      liveContentRef,
      onContentChange: (html) => {
        liveContentRef.current = html;
      },
    });

    expect(editorEl.innerHTML).toBe(ENTER_SNAPSHOT);
    typeInto(editorEl, TYPED);

    // A parent state update re-supplies a slightly different stale snapshot
    // (e.g. a re-entered/normalized enter-time capture). The live DOM holds
    // newer words — it must win.
    rerender(
      <ImmersiveFocusMode {...props} content={`${ENTER_SNAPSHOT}\n`} />
    );

    expect(editorEl.innerHTML).toContain("clean-exit-marker");
  });

  it("re-seeds a remount from the live buffer, not the enter-time snapshot", () => {
    // Parent-side sequence: enter (buffer = snapshot), type (buffer = typed),
    // then an intermittent remount of the overlay slot.
    const liveContentRef = { current: TYPED };
    const { editorEl } = renderOverlay({
      content: ENTER_SNAPSHOT,
      liveContentRef,
    });

    // Mount must apply the freshest buffered words, so even a remount
    // mid-session cannot lose keystrokes.
    expect(editorEl.innerHTML).toContain("clean-exit-marker");
  });

  it("reports the live innerHTML through onContentChange on every input", () => {
    const seen: string[] = [];
    const { editorEl } = renderOverlay({
      onContentChange: (html) => {
        seen.push(html);
      },
    });

    typeInto(editorEl, TYPED);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(TYPED);
  });

  it("keeps typed words across internal session-timer re-renders", () => {
    vi.useFakeTimers();
    const { editorEl } = renderOverlay();

    typeInto(editorEl, TYPED);

    // Three timer ticks -> three internal re-renders of the overlay.
    vi.advanceTimersByTime(3_000);

    expect(editorEl.innerHTML).toContain("clean-exit-marker");
  });

  it("exits on Escape", () => {
    const onExit = vi.fn();
    renderOverlay({ onExit });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
