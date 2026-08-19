// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

import { useSaveChapterContent } from "@/hooks/use-documents";
import {
  KEEPALIVE_MAX_BODY_BYTES,
  __resetKeepaliveBudget,
} from "@/components/editor/save-flush";

/**
 * D-133 — the pagehide/visibilitychange server flush must send the stamped PUT
 * with `keepalive: true` so a real close lets it complete server-side
 * (sendBeacon can't do PUT + JSON headers; fetch keepalive is the modern
 * equivalent). Normal autosaves must NOT set keepalive, and an over-cap body
 * must fall back to a normal fetch rather than throw at teardown.
 */

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function mockOkFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ wordCount: 1, version: 2, bookWordCount: 10 }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function initOf(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit;
}

/**
 * A fetch mock whose promises stay pending until we resolve them, so we can
 * hold several keepalive PUTs "in flight" at once and observe the shared budget.
 */
function makeDeferredFetch() {
  const resolvers: Array<() => void> = [];
  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(() =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ wordCount: 1, version: 2, bookWordCount: 10 }),
          })
        );
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    resolveAll: () => resolvers.forEach((r) => r()),
  };
}

/** ~42KB markdown: individually under the 60KB cap, but two together are over. */
const OVERSHARE = "x".repeat(Math.floor(KEEPALIVE_MAX_BODY_BYTES * 0.7));

function keepaliveFlagsOf(fetchMock: ReturnType<typeof vi.fn>): boolean[] {
  return fetchMock.mock.calls.map(
    (call) => (call[1] as RequestInit).keepalive === true
  );
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.unstubAllGlobals();
  __resetKeepaliveBudget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetKeepaliveBudget();
});

describe("useSaveChapterContent — D-133 keepalive threading", () => {
  it("passes keepalive:true down to fetch on the flush path", async () => {
    const fetchMock = mockOkFetch();
    const { result } = renderHook(() => useSaveChapterContent("b1", "c1"), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        markdown: "an accepted sentence",
        expectedVersion: 1,
        keepalive: true,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initOf(fetchMock).keepalive).toBe(true);
    expect(initOf(fetchMock).method).toBe("PUT");
  });

  it("leaves keepalive falsy for a normal autosave", async () => {
    const fetchMock = mockOkFetch();
    const { result } = renderHook(() => useSaveChapterContent("b1", "c1"), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        markdown: "typed words",
        expectedVersion: 1,
      });
    });

    expect(initOf(fetchMock).keepalive).not.toBe(true);
  });

  it("falls back to a normal fetch when the keepalive body exceeds the 64KB cap", async () => {
    const fetchMock = mockOkFetch();
    const { result } = renderHook(() => useSaveChapterContent("b1", "c1"), {
      wrapper: makeWrapper(),
    });

    // Over the keepalive body cap even before the JSON envelope is added.
    const huge = "x".repeat(KEEPALIVE_MAX_BODY_BYTES + 1);
    await act(async () => {
      await result.current.mutateAsync({
        markdown: huge,
        expectedVersion: 1,
        keepalive: true,
      });
    });

    // The PUT still goes out (best effort) — just without keepalive, so it
    // cannot throw at teardown. The local draft buffer covers recovery.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initOf(fetchMock).keepalive).not.toBe(true);
  });
});

describe("useSaveChapterContent — F2 shared in-flight keepalive budget (split-view)", () => {
  it("two panes flushing at once: the second falls back to a plain fetch, not a throw", async () => {
    // split-editor.tsx mounts two ManuscriptEditor panes; on close both flush
    // keepalive PUTs simultaneously. Two ~42KB bodies each individually pass
    // bodyFitsKeepalive yet jointly exceed the browser's 64KB keepalive cap —
    // pre-fix both went keepalive and the SECOND fetch threw, dropping that
    // pane's words. The budget must demote the second to a plain fetch.
    const { fetchMock, resolveAll } = makeDeferredFetch();
    const wrapper = makeWrapper();
    const paneA = renderHook(() => useSaveChapterContent("b1", "cA"), { wrapper });
    const paneB = renderHook(() => useSaveChapterContent("b1", "cB"), { wrapper });

    await act(async () => {
      // Fire both while neither fetch has settled — both reservations contend.
      void paneA.result.current.mutateAsync({
        markdown: OVERSHARE,
        expectedVersion: 1,
        keepalive: true,
      });
      void paneB.result.current.mutateAsync({
        markdown: OVERSHARE,
        expectedVersion: 1,
        keepalive: true,
      });
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const flags = keepaliveFlagsOf(fetchMock);
    expect(flags[0]).toBe(true); // first pane fits the budget
    expect(flags[1]).toBe(false); // second pane demoted to a plain fetch

    // Let the pending PUTs settle so nothing leaks between tests.
    await act(async () => {
      resolveAll();
      await flushMicrotasks();
    });
  });

  it("survival path: a settled flush releases its budget so the next flush regains keepalive", async () => {
    // The common phone-backgrounding case is visibilitychange WITHOUT close —
    // the page survives and the PUT settles. Release MUST run on settle so a
    // later flush of the same size can use keepalive again (page-death is the
    // only path where release is legitimately skipped).
    const { fetchMock, resolveAll } = makeDeferredFetch();
    const wrapper = makeWrapper();
    const paneA = renderHook(() => useSaveChapterContent("b1", "cA"), { wrapper });
    const paneB = renderHook(() => useSaveChapterContent("b1", "cB"), { wrapper });

    // Pane A flushes ~42KB and settles (survival path).
    await act(async () => {
      const p = paneA.result.current.mutateAsync({
        markdown: OVERSHARE,
        expectedVersion: 1,
        keepalive: true,
      });
      await flushMicrotasks();
      resolveAll();
      await p;
    });

    // Pane B flushes ~42KB afterwards — with the budget released it fits again.
    await act(async () => {
      const p = paneB.result.current.mutateAsync({
        markdown: OVERSHARE,
        expectedVersion: 1,
        keepalive: true,
      });
      await flushMicrotasks();
      resolveAll();
      await p;
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const flags = keepaliveFlagsOf(fetchMock);
    expect(flags[0]).toBe(true);
    expect(flags[1]).toBe(true); // budget was freed on the first flush's settle
  });
});
