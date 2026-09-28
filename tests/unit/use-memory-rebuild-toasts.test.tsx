// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * The rebuild route answers 402 (Free cap) and 503 (embeddings down) with an
 * English `error`. The hook used to throw that string and the toast showed it,
 * so a writer in any other language read English at the one moment the
 * product explains its own limit. The hook maps both answers onto the
 * dictionary; only an unexpected failure still surfaces the server's message.
 */

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useRebuildIndex } from "@/hooks/use-memory";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function answer(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

const en = getUIStrings("en").toasts;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("useRebuildIndex — what the writer is told", () => {
  it("a paused Free writer reads the dictionary's line, not the server's", async () => {
    answer(402, { error: "Memory indexing is paused on the Free plan …", indexingPaused: true });
    const { result } = renderHook(() => useRebuildIndex(), { wrapper });

    expect(en.memoryIndexingPaused).toBeTruthy();
    await expect(result.current.mutateAsync("b1")).rejects.toMatchObject({
      message: en.memoryIndexingPaused,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("an embeddings outage reads the dictionary's line too", async () => {
    answer(503, { error: "Memory indexing is unavailable right now.", indexingPaused: false });
    const { result } = renderHook(() => useRebuildIndex(), { wrapper });

    expect(en.memoryIndexingUnavailable).toBeTruthy();
    await expect(result.current.mutateAsync("b1")).rejects.toMatchObject({
      message: en.memoryIndexingUnavailable,
    });
  });

  it("any other failure still carries the server's reason", async () => {
    answer(500, { error: "Qdrant unreachable" });
    const { result } = renderHook(() => useRebuildIndex(), { wrapper });

    await expect(result.current.mutateAsync("b1")).rejects.toMatchObject({
      message: "Qdrant unreachable",
    });
  });
});
