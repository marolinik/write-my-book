// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useAddBookToSeries } from "@/hooks/use-series";
import { useUpgradeModal } from "@/hooks/use-billing";

/**
 * X-S19 / P7-S14 (client half) — once the series "New Book" route answers the
 * book cap with 403 + upgradeToTier, the series screen must route it to the
 * upgrade modal like /books/new does, not drop it on the floor. The hook's
 * siblings (useCreateBook, useCreateSeries) already do this.
 */

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useUpgradeModal.getState().hide();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAddBookToSeries — a plan denial opens the upgrade modal", () => {
  it("shows the modal with the server's reason and tier on 403 + upgradeToTier", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "Free plan includes 1 book. Upgrade to Indie for 2 active books and unlimited AI runs.",
            upgradeToTier: "indie",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const { result } = renderHook(() => useAddBookToSeries("series-1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Book Five" }).catch(() => {});
    });

    await waitFor(() => expect(useUpgradeModal.getState().open).toBe(true));
    expect(useUpgradeModal.getState().reason).toContain("Free plan includes 1 book");
    expect(useUpgradeModal.getState().upgradeToTier).toBe("indie");
  });

  it("leaves the modal closed for an ordinary failure (no upgradeToTier)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Series not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const { result } = renderHook(() => useAddBookToSeries("series-1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Book Five" }).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useUpgradeModal.getState().open).toBe(false);
  });
});
