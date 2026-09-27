// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createElement } from "react";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { getModelDef } from "@/lib/llm/model-registry";
import { PROVIDERS, type ProviderKey } from "@/lib/llm/providers";

/**
 * UAT P2-S02 — a writer who connected Gemini in the onboarding wizard and
 * picked it as the default got a success toast, while the default model
 * stayed the deployment default. The wizard sent "gemini/gemini-2.5-pro";
 * the registry id is "gemini/2.5-pro", so PATCH /api/settings/default-model
 * answered 400 — and the wizard never looked at the answer.
 */

const sr = getUIStrings("sr");

const h = vi.hoisted(() => ({
  keys: [] as Array<{ provider: string; validatedAt: string | null }>,
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "sr", t: sr }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
vi.mock("@/hooks/use-api-keys", () => ({
  useApiKeys: () => ({ data: h.keys, refetch: vi.fn() }),
}));
// Adding a key is not under test; the wizard only needs the validated list.
vi.mock("@/components/onboarding/provider-card", () => ({ ProviderCard: () => null }));

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

type Call = { url: string; method: string; body: unknown; status?: number };

/** The two endpoints the wizard calls, answering as the real routes do. */
function server({ defaultModelStatus }: { defaultModelStatus?: number } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call: Call = { url, method, body };
    calls.push(call);
    if (url === "/api/settings/onboarding") {
      call.status = 200;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url === "/api/settings/default-model") {
      // default-model/route.ts: an id the registry does not know is a 400.
      const known = getModelDef((body as { defaultModel: string }).defaultModel);
      const status = defaultModelStatus ?? (known ? 200 : 400);
      call.status = status;
      const payload = status === 200 ? { success: true } : { error: "Unknown model ID for defaultModel" };
      return new Response(JSON.stringify(payload), { status });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

async function finishWith(provider: ProviderKey) {
  h.keys = [{ provider, validatedAt: "2026-09-25T10:00:00.000Z" }];
  render(createElement(OnboardingWizard));
  fireEvent.click(screen.getByText(sr.onboardingUI.getStarted));
  fireEvent.click(screen.getByText(sr.onboardingUI.continueLabel));
  fireEvent.click(screen.getByText(sr.onboardingUI.finishSetup));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("onboarding wizard: default provider (P2-S02)", () => {
  it.each(PROVIDERS.map((p) => p.key))(
    "saves a default model the registry knows, for %s",
    async (provider) => {
      const calls = server();
      await finishWith(provider);

      await waitFor(() => expect(calls.some((c) => c.url === "/api/settings/default-model")).toBe(true));
      const patch = calls.find((c) => c.url === "/api/settings/default-model")!;
      const def = getModelDef((patch.body as { defaultModel: string }).defaultModel);
      expect(def?.provider).toBe(provider);
    }
  );

  it("saves Gemini and only then reports success", async () => {
    const calls = server();
    await finishWith("gemini");

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard"));
    expect(calls.find((c) => c.url === "/api/settings/default-model")?.status).toBe(200);
    expect(h.toastSuccess).toHaveBeenCalledWith(sr.toasts.onboardingComplete);
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("says so, in the writer's language, when the default model is not saved", async () => {
    server({ defaultModelStatus: 500 });
    await finishWith("gemini");

    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(sr.onboardingUI.defaultModelNotSaved));
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    // The writer can try again: the button is live, not stuck on "Finishing...".
    expect((screen.getByText(sr.onboardingUI.finishSetup).closest("button") as HTMLButtonElement).disabled).toBe(false);
  });
});
