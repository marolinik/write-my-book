// @vitest-environment jsdom
// P2-50: the book overview read localStorage in its useState initializer, so a
// writer who last chose Canvas got a different first render than the server
// sent (table vs board) and a hydration error on every load. The first render
// is now always the list; the stored view is adopted after mount.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, cleanup, waitFor } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
  useLocale: () => "en-US",
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/book/book-canvas", () => ({ BookCanvas: () => <div data-testid="canvas-view" /> }));
vi.mock("@/components/book/chapter-pipeline", () => ({ ChapterPipeline: () => <div data-testid="pipeline-view" /> }));
vi.mock("@/components/book/corkboard-view", () => ({ CorkboardView: () => <div data-testid="corkboard-view" /> }));

import { BookViewSwitcher } from "@/components/book/book-view-switcher";

const labels = {
  chapters: "Chapters", addChapter: "Add", noChapters: "None", colNum: "#", colTitle: "Title",
  colAct: "Act", colStatus: "Status", colWords: "Words", colScore: "Score", colAction: "",
  untitled: "Untitled", act: "Act", edit: "Edit",
};
const chapters = [{ id: "c1", chapterNumber: 1, title: "One", status: "drafted", wordCount: 900, actNumber: 1, targetWordCount: null, betaScore: null }];
const ui = <BookViewSwitcher bookId="b1" chapters={chapters} labels={labels} />;

beforeEach(() => localStorage.setItem("wmb-book-view-b1", "canvas"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("BookViewSwitcher first render", () => {
  it("is the list even when the writer stored another view (matches the server)", () => {
    const html = renderToString(ui);
    expect(html).toContain("<table");
    expect(html).not.toContain("canvas-view");
  });

  it("adopts the stored view after mount, and keeps it stored", async () => {
    const { getByTestId } = render(ui);
    await waitFor(() => expect(getByTestId("canvas-view")).toBeTruthy());
    expect(localStorage.getItem("wmb-book-view-b1")).toBe("canvas");
  });
});
