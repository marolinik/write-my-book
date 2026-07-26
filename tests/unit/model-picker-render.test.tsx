// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * D-131 (render pin) — all three `openrouter-qwen36/*` tier ids share the
 * displayName "Qwen 3.6 27B (OpenRouter)". The picker dedupes same-displayName
 * variants; when it kept only the highest tier, a stored non-kept id (Sam's
 * seeded `openrouter-qwen36/sonnet`) had NO SelectItem, so Radix rendered a
 * BLANK trigger and the writer couldn't see their own default model.
 *
 * This renders the real ModelPicker with that stored value and asserts the
 * closed combobox trigger shows the family displayName — the symptom is dead.
 * Companion to model-picker-groups.test.ts, which pins the pure dedupe.
 */

// Radix Select touches a handful of DOM APIs jsdom omits — polyfill them so the
// real SelectTrigger/SelectValue mount and resolve item text.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!window.matchMedia) {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })) as unknown as typeof window.matchMedia;
  }
});

import { ModelPicker } from "@/components/settings/model-picker";

const QWEN_NAME = "Qwen 3.6 27B (OpenRouter)";

afterEach(() => cleanup());

describe("ModelPicker — D-131 stored id renders its family displayName, not blank", () => {
  it("shows the Qwen family displayName on the trigger for a stored sonnet-tier id", () => {
    render(
      <ModelPicker
        value="openrouter-qwen36/sonnet"
        availableProviders={["openrouter"]}
        onChange={() => {}}
        label="Model"
      />
    );

    const trigger = screen.getByRole("combobox");
    // Radix mounts closed content into a DocumentFragment and portals the
    // selected item's text into the trigger's value node, so the closed
    // trigger carries the displayName even without opening the listbox.
    expect(trigger.textContent).toContain(QWEN_NAME);
  });
});
