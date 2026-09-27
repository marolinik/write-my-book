// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

// UAT P2-S19: the model pickers listed every custom-provider model, but the
// default-model route only accepts registry ids and nothing at run time can
// call a custom provider yet — so every pick answered 400 with raw English
// text. Until runs can use them, the pickers must not offer an option that
// always fails, and the custom-providers card says so.

const pickerProps: Array<Record<string, unknown>> = [];

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
  useLocale: () => "en-US",
}));
vi.mock("@/hooks/use-default-model", () => ({
  useDefaultModel: () => ({ data: { defaultModel: "anthropic/sonnet", localFleet: false } }),
  useUpdateDefaultModel: () => ({ mutate: vi.fn() }),
  useUpdateGlobalRoleOverride: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/use-custom-providers", () => ({
  useCustomProviders: () => ({
    data: [
      {
        id: "cp1",
        displayName: "Vast vLLM",
        baseURL: "http://10.0.0.5:8000/v1",
        api: "openai",
        hasKey: false,
        maskedKey: null,
        models: [{ id: "z-ai/glm-5.3-prime", name: "GLM 5.3 Prime" }],
      },
    ],
    defs: [{ id: "z-ai/glm-5.3-prime", provider: "local", displayName: "Vast vLLM: GLM 5.3 Prime" }],
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/components/settings/model-picker", () => ({
  ModelPicker: (props: Record<string, unknown>) => {
    pickerProps.push(props);
    return null;
  },
}));

import { ModelSelectionSection } from "@/components/settings/model-selection-section";
import { CustomProvidersSection } from "@/components/settings/custom-providers-section";

afterEach(() => {
  cleanup();
  pickerProps.length = 0;
});

describe("custom-provider models are not offered where they cannot run (P2-S19)", () => {
  it("no picker receives custom-provider models", () => {
    render(<ModelSelectionSection />);
    expect(pickerProps.length).toBeGreaterThan(0);
    for (const props of pickerProps) {
      expect(props.customModels ?? []).toEqual([]);
    }
  });

  it("custom providers alone do not open the local slot", () => {
    render(<ModelSelectionSection />);
    for (const props of pickerProps) {
      expect(props.availableProviders).not.toContain("local");
    }
  });

  it("the custom-providers card says their models cannot be chosen for runs yet", () => {
    render(<CustomProvidersSection />);
    expect(
      screen.getByText(getUIStrings("en").settings.customProvidersNotForRuns)
    ).toBeTruthy();
  });
});
