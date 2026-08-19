// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  useUpdateBookSettings,
  type BookSettingsData,
} from "@/hooks/use-settings";

/**
 * D-174 — finishing the setup wizard changed nothing in the chrome until a
 * reload: the sidebar still read "Getting Started 2/5" with "Style [Next Step]"
 * for the rest of the SPA session, i.e. the exact pixel-identical pre/post
 * symptom D-160 was raised for.
 *
 * Mechanism: the wizard PATCHed `/api/books/{id}/settings` with raw `fetchJson`
 * and never invalidated `["book-settings", bookId]` — the key `use-book-state`
 * reads to derive setup progress and the recommendation ladder. The
 * invalidation existed, but only inside `useUpdateBookSettings`, which the
 * wizard bypassed.
 *
 * These tests pin both halves: the hook DOES invalidate the key the chrome
 * reads, and the wizard is not allowed to bypass it again.
 */

const BOOK = "book-1";
const SETTINGS_KEY = ["book-settings", BOOK];

const fetchJsonMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

const WIZARD_SOURCE = readFileSync(
  join(process.cwd(), "src/app/(app)/books/[bookId]/setup/page.tsx"),
  "utf8"
);

beforeEach(() => {
  fetchJsonMock.mockReset();
  fetchJsonMock.mockResolvedValue({ setupComplete: true });
});

describe("book-settings mutation invalidates the chrome's query (D-174)", () => {
  it("marks ['book-settings', bookId] stale after a successful PATCH", async () => {
    const qc = makeClient();
    // Pre-completion snapshot, exactly what the sidebar was rendering from.
    qc.setQueryData(SETTINGS_KEY, { setupComplete: false });

    const { result } = renderHook(() => useUpdateBookSettings(BOOK), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ setupComplete: true });
    });

    expect(qc.getQueryState(SETTINGS_KEY)?.isInvalidated).toBe(true);
  });

  it("PATCHes only the keys it was given (the route is .strict())", async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useUpdateBookSettings(BOOK), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ setupImportSkipped: true });
    });

    expect(fetchJsonMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchJsonMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/books/${BOOK}/settings`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ setupImportSkipped: true });
  });

  it("leaves the query alone when the PATCH fails", async () => {
    const qc = makeClient();
    qc.setQueryData(SETTINGS_KEY, { setupComplete: false });
    fetchJsonMock.mockRejectedValueOnce(new Error("500 Internal Server Error"));

    const { result } = renderHook(() => useUpdateBookSettings(BOOK), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ setupComplete: true })
      ).rejects.toThrow("500");
    });

    // No optimistic lie: the cache still says setup is unfinished.
    expect(qc.getQueryState(SETTINGS_KEY)?.isInvalidated).toBe(false);
    expect(qc.getQueryData(SETTINGS_KEY)).toEqual({ setupComplete: false });
  });

  it("types the setup flags, so the wizard can go through the hook", () => {
    // Guarded by `tsc --noEmit`: before D-174 these two keys were absent from
    // BookSettingsData, which is why the wizard hand-rolled its own fetch.
    const patch: Partial<Omit<BookSettingsData, "id" | "bookId">> = {
      setupComplete: true,
      setupImportSkipped: true,
    };
    expect(patch).toEqual({ setupComplete: true, setupImportSkipped: true });
  });
});

describe("the setup wizard does not bypass the mutation hook (D-174)", () => {
  it("uses useUpdateBookSettings", () => {
    expect(WIZARD_SOURCE).toContain("useUpdateBookSettings");
  });

  it("issues no hand-rolled PATCH to the settings endpoint", () => {
    // Any raw call to the settings route from the wizard re-opens the defect:
    // it would persist the flag while leaving every other surface stale.
    expect(WIZARD_SOURCE).not.toMatch(/fetchJson[\s\S]{0,80}\/settings`/);
  });
});
