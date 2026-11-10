// @vitest-environment jsdom
// P1-12 / D3: settings offered OpenAI, Gemini and Grok keys that could never
// work (no relay is deployed). New keys for them are no longer offered; a key
// a writer already saved stays visible so they can delete it, with a note to
// use OpenRouter instead.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const state = vi.hoisted(() => ({ keys: [] as Array<Record<string, unknown>> }));

vi.mock("@/components/providers/language-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/providers/language-provider")>();
  const { getUIStrings } = await import("@/lib/i18n/ui-strings");
  return { ...actual, useLanguage: () => ({ language: "en", t: getUIStrings("en"), isLoading: false }) };
});
vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: state.keys, isLoading: false }),
}));
vi.mock("@/components/onboarding/provider-card", () => ({
  ProviderCard: ({ provider }: { provider: { key: string } }) => <div data-testid={`card-${provider.key}`} />,
}));
vi.mock("@/components/settings/custom-providers-section", () => ({ CustomProvidersSection: () => null }));

import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const NOTE = getUIStrings("en").settings.relayKeyUnsupported;

afterEach(() => {
  cleanup();
  state.keys = [];
});

describe("ApiKeysSection", () => {
  it("offers only Anthropic and OpenRouter keys to a writer with none saved", () => {
    render(<ApiKeysSection />);
    expect(screen.getByTestId("card-anthropic")).toBeTruthy();
    expect(screen.getByTestId("card-openrouter")).toBeTruthy();
    expect(screen.queryByTestId("card-openai")).toBeNull();
    expect(screen.queryByTestId("card-gemini")).toBeNull();
    expect(screen.queryByTestId("card-grok")).toBeNull();
  });

  it("keeps a saved Gemini key visible with the use-OpenRouter note", () => {
    state.keys = [{ id: "k1", provider: "gemini", maskedKey: "AIza...1234", validatedAt: "2026-11-01", usage: null }];
    render(<ApiKeysSection />);
    expect(screen.getByTestId("card-gemini")).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
});
