// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useDocumentContent } from "@/hooks/use-documents";

/**
 * P5-S23 — a planning document's first autosave went out without
 * `expectedVersion` and silently overwrote a concurrent agent write to the
 * Story Bible.
 *
 * GET /api/books/:id/documents/:docId answers `{ document, content }` (the
 * DocumentService.read shape), but the hook typed and returned it as if it
 * were flat. `docData.currentVersion` was therefore undefined, the page
 * stamped the pane with undefined, and the first PATCH skipped the CAS check
 * the page comments promise. The hook must hand the page the loaded version.
 */

const DOC = {
  id: "doc-1",
  bookId: "book-1",
  type: "STORY_BIBLE",
  title: "Story Bible",
  storageKey: "books/book-1/story-bible.md",
  currentVersion: 4,
  chapterNumber: null,
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-21T10:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDocumentContent — the version the autosave stamps with", () => {
  it("exposes the document's currentVersion from the route's { document, content } body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ document: DOC, content: "# Bible" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const { result } = renderHook(
      () => useDocumentContent("book-1", "doc-1"),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    // Without this the pane is stamped with undefined and the first save is
    // an unguarded last-write-wins PATCH.
    expect(result.current.data?.currentVersion).toBe(4);
    expect(result.current.data?.content).toBe("# Bible");
    // The page also reads the type and title (aria-label, header, prev/next).
    expect(result.current.data?.type).toBe("STORY_BIBLE");
    expect(result.current.data?.title).toBe("Story Bible");
  });
});
