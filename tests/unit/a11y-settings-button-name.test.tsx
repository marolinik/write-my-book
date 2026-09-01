// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

// D-10 (axe button-name, CRITICAL): the /settings screen had 8 icon/combobox
// buttons with no discernible text — the 7 model-selection comboboxes + the
// language selector. Screen-reader users heard "button". The fix (commit
// 5ecac6e) gave each Radix SelectTrigger an aria-label. This test renders the
// real settings components and asserts every rendered <button> exposes an
// accessible name. Removing an aria-label re-reds it.

// Radix Select touches a few DOM APIs jsdom omits — polyfill so the real
// SelectTrigger (the element D-10 named) mounts.
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

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
  useLocale: () => "en-US",
}));
vi.mock("@/hooks/use-default-model", () => ({
  useDefaultModel: () => ({ data: undefined }),
  useUpdateDefaultModel: () => ({ mutate: vi.fn() }),
  useUpdateGlobalRoleOverride: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: [], isLoading: false }),
  useAddApiKey: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteApiKey: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// caf8075 added custom-provider discovery to ModelSelectionSection (react-query).
vi.mock("@/hooks/use-custom-providers", () => ({
  useCustomProviders: () => ({ data: [], defs: [] }),
}));

import { ModelSelectionSection } from "@/components/settings/model-selection-section";
import { ProviderCard } from "@/components/onboarding/provider-card";
import { PROVIDERS } from "@/lib/llm/providers";

afterEach(() => cleanup());

/** Approximate the axe accessible-name computation for a <button>. */
function accessibleName(btn: HTMLElement): string {
  const aria = btn.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const labelledby = btn.getAttribute("aria-labelledby");
  if (labelledby) {
    const doc = btn.ownerDocument;
    const txt = labelledby
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (txt) return txt;
  }
  const text = btn.textContent?.trim();
  if (text) return text;
  const title = btn.getAttribute("title");
  if (title && title.trim()) return title.trim();
  return "";
}

function auditButtons(container: HTMLElement): number {
  const buttons = Array.from(container.querySelectorAll("button"));
  expect(buttons.length).toBeGreaterThan(0);
  const nameless = buttons.filter((b) => accessibleName(b) === "");
  // Report the offending markup on failure, not just a count.
  expect(nameless.map((b) => b.outerHTML)).toEqual([]);
  return buttons.length;
}

describe("D-10 /settings buttons have discernible names (axe button-name)", () => {
  it("every model-selection combobox trigger is named", () => {
    const { container } = render(<ModelSelectionSection />);
    const count = auditButtons(container);
    // 1 global default + 6 per-role overrides = 7 combobox triggers.
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it("provider-card action buttons are named (connected state)", () => {
    const { container } = render(
      <ProviderCard
        provider={PROVIDERS[0]}
        existingKey={{
          id: "k1",
          maskedKey: "sk-…abcd",
          validatedAt: new Date().toISOString(),
        }}
      />
    );
    auditButtons(container);
  });
});
