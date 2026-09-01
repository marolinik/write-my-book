// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

// D-54: axe found three page-heading violations (P5 J-4) — heading-order ×2
// (books list empty-state jumped h1→h3; settings jumped h1→h4) and
// page-has-heading-one ×1 (the new-book form had no <h1> at all, because
// shadcn CardTitle renders a <div>, not a heading). These render-level tests
// reproduce the axe `heading-order` + `page-has-heading-one` rules
// deterministically. (Landmark/button-name axe findings are separate defects,
// out of D-54 scope.)

// ── Mocks: data/deps only; the heading markup under test stays real ──
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    book: { findMany: vi.fn() },
    chapter: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/use-books", () => ({
  useCreateBook: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-series", () => ({ useSeries: () => ({ data: [] }) }));
vi.mock("@/hooks/use-default-model", () => ({
  useDefaultModel: () => ({ data: undefined }),
  useUpdateDefaultModel: () => ({ mutate: vi.fn() }),
  useUpdateGlobalRoleOverride: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-api-keys", () => ({ useApiKeys: () => ({ data: [] }) }));
vi.mock("@/hooks/use-custom-providers", () => ({
  useCustomProviders: () => ({ data: [], defs: [] }),
}));
// Stub the model picker so the heading assertion does not depend on Select internals.
vi.mock("@/components/settings/model-picker", () => ({ ModelPicker: () => null }));

import BooksPage from "@/app/(app)/books/page";
import NewBookPage from "@/app/(app)/books/new/page";
import { ModelSelectionSection } from "@/components/settings/model-selection-section";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Heading levels in DOM order, e.g. [1, 2, 2]. */
function headingLevels(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((el) =>
    Number(el.tagName[1])
  );
}

/** axe `heading-order`: a level may never increase by more than one. */
function assertNoSkippedLevels(levels: number[]): void {
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  }
}

describe("D-54 page-heading a11y", () => {
  it("books list (empty state): h1 then h2, no skipped level", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      preferredLanguage: "en",
    } as never);
    vi.mocked(db.book.findMany).mockResolvedValue([] as never);
    vi.mocked(db.chapter.groupBy).mockResolvedValue([] as never);
    vi.mocked(db.chapter.findMany).mockResolvedValue([] as never);

    const ui = await BooksPage();
    const { container } = render(ui);
    const levels = headingLevels(container);

    expect(levels[0]).toBe(1); // page <h1> present
    expect(levels).not.toContain(3); // empty-state heading no longer an h3
    assertNoSkippedLevels(levels); // h1 -> h2
  });

  it("new-book form exposes a level-one heading (page-has-heading-one)", () => {
    render(<NewBookPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(getUIStrings("en").newBook.title);
  });

  it("settings 'Per-Role Overrides' subheading is an h2, not a skipped h4", () => {
    render(<ModelSelectionSection />);
    expect(screen.getByText("Per-Role Overrides").tagName).toBe("H2");
  });
});
