// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * P3-S08, the UI half. When the reorder request failed, the book manager said
 * nothing: no toast, no error text, the order simply did not change. The
 * writer clicked an arrow and could not tell a refusal from a slow network.
 */

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  reorderMutate: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn() } }));

vi.mock("@/components/providers/language-provider", async () => {
  const { getUIStrings } = await import("@/lib/i18n/ui-strings");
  const strings = getUIStrings("sr");
  return {
    useLanguage: () => ({ t: strings, language: "sr" }),
    useLocale: () => "sr-Latn-RS",
  };
});

vi.mock("@/hooks/use-series", () => ({
  useAddBookToSeries: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRemoveBookFromSeries: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderBook: () => ({ mutate: h.reorderMutate, isPending: false }),
}));

import { SeriesBookManager } from "@/components/series/series-book-manager";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const books = [
  { id: "A", bookNumber: 1, name: "Prva", status: "writing", wordCount: 1000 },
  { id: "B", bookNumber: 2, name: "Druga", status: "writing", wordCount: 1000 },
  { id: "C", bookNumber: 3, name: "Treća", status: "writing", wordCount: 1000 },
];

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SeriesBookManager seriesId="s1" books={books} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  h.toastError.mockReset();
  h.reorderMutate.mockReset();
  // The server refuses the move, as it did for every adjacent move.
  h.reorderMutate.mockImplementation(
    (_vars: unknown, options?: { onError?: (e: Error) => void }) =>
      options?.onError?.(new Error("Failed to reorder book"))
  );
});

afterEach(cleanup);

describe("SeriesBookManager — a failed reorder is reported", () => {
  it("tells the writer, in their language, when moving a book up fails", () => {
    renderManager();
    const buttons = screen.getAllByRole("button");
    // Each card starts with its up arrow, then its down arrow; #3's up arrow:
    const upOnThird = buttons.filter((b) => b.querySelector("svg.lucide-arrow-up"))[2];

    fireEvent.click(upOnThird);

    expect(h.reorderMutate).toHaveBeenCalledWith(
      { bookId: "C", newBookNumber: 2 },
      expect.anything()
    );
    const expected = getUIStrings("sr").toasts.seriesReorderFailed;
    expect(typeof expected).toBe("string");
    expect(h.toastError).toHaveBeenCalledWith(expected);
  });

  it("does the same for moving a book down", () => {
    renderManager();
    const downOnFirst = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg.lucide-arrow-down"))[0];

    fireEvent.click(downOnFirst);

    expect(h.toastError).toHaveBeenCalledTimes(1);
  });
});
