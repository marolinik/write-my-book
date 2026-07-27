// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * D-189 (UI half) — the captured assertion was
 * `dialog_offers_whole_word_option: false` on the rendered Find & Replace
 * dialog. The dialog must now OFFER whole-word matching, default it ON (least
 * surprise for a character rename, which is the job the writer opens this
 * dialog to do), and thread the flag through both the live preview query and
 * the Replace-all mutation. A query with no word character at either edge
 * cannot be matched whole-word at all, so the toggle disables itself instead
 * of silently returning zero matches.
 */

const h = vi.hoisted(() => ({
  useBookSearch: vi.fn(),
  mutateAsync: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-find-replace", () => ({
  useBookSearch: (...a: unknown[]) => h.useBookSearch(...a),
  useBookReplace: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import { FindReplaceDialog } from "@/components/editor/find-replace-dialog";

const HITS = {
  hits: [
    {
      chapterId: "ch1",
      chapterNumber: 1,
      title: "One",
      count: 6,
      snippets: [{ before: "…", match: "Sam", after: " saw" }],
    },
  ],
  totalCount: 6,
};

function renderDialog() {
  return render(
    <FindReplaceDialog
      open
      onOpenChange={() => {}}
      bookId="b1"
      chapterId="ch1"
    />
  );
}

/** `wholeWord` argument of the most recent useBookSearch call. */
function lastSearchWholeWord(): unknown {
  const args = h.useBookSearch.mock.calls.at(-1) as unknown[];
  return args?.[3];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.useBookSearch.mockReturnValue({
    data: HITS,
    isLoading: false,
    isError: false,
  });
  h.mutateAsync.mockResolvedValue({
    replaced: [{ chapterId: "ch1", count: 6, newVersion: 3 }],
    totalReplacements: 6,
  });
});
afterEach(() => cleanup());

describe("D-189: Find & Replace dialog offers whole-word matching", () => {
  it("renders a whole-word switch that is ON by default", () => {
    renderDialog();
    const toggle = screen.getByRole("switch", { name: /whole word/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
  });

  it("passes wholeWord to the live search query", () => {
    renderDialog();
    // useBookSearch(bookId, q, caseSensitive, wholeWord, enabled)
    expect(lastSearchWholeWord()).toBe(true);
  });

  it("sends wholeWord with Replace all, and false once toggled off", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Find"), {
      target: { value: "Sam" },
    });
    fireEvent.click(screen.getByRole("button", { name: /replace all/i }));

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      find: "Sam",
      wholeWord: true,
    });

    fireEvent.click(screen.getByRole("switch", { name: /whole word/i }));
    fireEvent.click(screen.getByRole("button", { name: /replace all/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.mutateAsync.mock.calls[1][0]).toMatchObject({ wholeWord: false });
  });

  it("disables itself for a search with no word edges (never a silent zero)", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Find"), {
      target: { value: "—" },
    });

    const toggle = screen.getByRole("switch", { name: /whole word/i });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(lastSearchWholeWord()).toBe(false);
  });
});
