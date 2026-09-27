// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor, act, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P1-S05 — the Free session wall was a lone line of red text.
 *
 * POST /agent answers the monthly cap (and the one-session fence) with 429 +
 * upgradeToTier "so the client can route it to the upgrade modal"
 * (quota-checker). useStartSession threw only `body.error`, dropping the tier,
 * and the panel printed the message in a <p>: no modal, no button, no link to
 * billing. The start hooks must route a plan denial to the upgrade modal, and
 * the panel's error must keep an Upgrade path after the modal is dismissed.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { useStartSession, useStartSeriesSession } from "@/hooks/use-agent";
import { useUpgradeModal } from "@/hooks/use-billing";
import { AgentStartError } from "@/components/agent/agent-start-error";

const EN = getUIStrings("en");
const WALL = "You've used 20 of 20 free AI sessions this month. They reset on the 1st (UTC). Upgrade to Indie for unlimited runs.";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stubWall(status = 429) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ error: WALL, upgradeToTier: "indie" }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}

beforeEach(() => {
  useUpgradeModal.getState().hide();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("P1-S05: a refused agent start opens the upgrade modal", () => {
  it("useStartSession: 429 + upgradeToTier → modal, and the error keeps the tier", async () => {
    stubWall();
    const { result } = renderHook(() => useStartSession("b1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ workflowId: "coach", pageContext: null }).catch(() => {});
    });

    await waitFor(() => expect(useUpgradeModal.getState().open).toBe(true));
    expect(useUpgradeModal.getState().reason).toBe(WALL);
    expect(useUpgradeModal.getState().upgradeToTier).toBe("indie");
    const err = result.current.error as (Error & { upgradeToTier?: string }) | null;
    expect(err?.message).toBe(WALL);
    expect(err?.upgradeToTier).toBe("indie");
  });

  it("useStartSeriesSession: the series door routes its wall the same way", async () => {
    stubWall();
    const { result } = renderHook(() => useStartSeriesSession("series-1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ workflowId: "coach", bookId: "b1" }).catch(() => {});
    });

    await waitFor(() => expect(useUpgradeModal.getState().open).toBe(true));
    expect(useUpgradeModal.getState().upgradeToTier).toBe("indie");
  });

  it("an ordinary failure (no upgradeToTier) does not open the modal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Unknown workflow" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const { result } = renderHook(() => useStartSession("b1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ workflowId: "nope", pageContext: null }).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useUpgradeModal.getState().open).toBe(false);
  });
});

describe("P1-S05: the panel's start error keeps an Upgrade path", () => {
  it("offers View Plans → /settings/billing next to a plan-wall message", () => {
    const err = Object.assign(new Error(WALL), { upgradeToTier: "indie" });
    render(<AgentStartError error={err} />);
    expect(screen.getByText(WALL)).toBeTruthy();
    const link = screen.getByRole("link", { name: EN.appUI.viewPlans });
    expect(link.getAttribute("href")).toBe("/settings/billing");
  });

  it("shows just the message for an error that is not a plan wall", () => {
    render(<AgentStartError error={new Error("Unknown workflow")} />);
    expect(screen.getByText("Unknown workflow")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing without an error", () => {
    const { container } = render(<AgentStartError error={null} />);
    expect(container.textContent).toBe("");
  });
});
