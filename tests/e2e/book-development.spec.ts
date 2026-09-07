import { test, expect } from "./fixtures";
import { createBookViaApi } from "./fixtures";

test.describe("Book Development hub", () => {
  test("hub page renders the six pre-draft stages on a fresh book", async ({
    page,
    request,
  }) => {
    const book = await createBookViaApi(request, {
      name: "BD Hub E2E",
      genre: "Fantasy",
    });

    await page.goto(`/books/${book.id}/dev`);
    await page.waitForLoadState("networkidle");

    // Header title names the hub.
    await expect(
      page.getByRole("heading", { name: /book development/i }).first()
    ).toBeVisible();

    // Every stage headline (rendered as numbered headings on the hub) is present.
    for (const [num, stage] of [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ].map((n, i) => [n, ["Idea", "Synopsis", "Structure", "Research", "Plan", "Draft"][i]])) {
      await expect(
        page.getByRole("heading", { name: new RegExp(`^${num}\\.\\s*${stage}$`) }).first()
      ).toBeVisible();
    }

    // UDG-9 (Petar): a fresh book with no research provider key surfaces the
    // research hint on the Research card (CI runs with no Perplexity/Serper/Firecrawl
    // keys configured).
    await expect(page.getByText(/web-search provider key/i).first()).toHaveCount(1);
  });

  test("hub survives a book that already has concept + synopsis documents", async ({
    page,
    request,
  }) => {
    const book = await createBookViaApi(request, {
      name: "BD Hub Status",
      genre: "Fantasy",
    });

    for (const type of ["CONCEPT", "SYNOPSIS"]) {
      await request.post(`/api/books/${book.id}/documents`, {
        data: { type, title: type, content: "test outline" },
      });
    }

    await page.goto(`/books/${book.id}/dev`);
    await page.waitForLoadState("networkidle");

    // The hub still renders the full pipeline once a concept + synopsis exist.
    await expect(
      page.getByRole("heading", { name: /book development/i }).first()
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^1\.\s*Idea$/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /^6\.\s*Draft$/ }).first()).toBeVisible();
  });

  test("book overview surfaces the Book Development CTA on a fresh book", async ({
    page,
    request,
  }) => {
    // UDG-1 (Raul/Simona): a book with no CONCEPT yet should route new writers
    // into the pre-draft pipeline from the overview, not into a blank editor.
    const book = await createBookViaApi(request, {
      name: "BD Overview CTA",
      genre: "Fantasy",
    });

    await page.goto(`/books/${book.id}`);
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("link", { name: /run workflow/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", `/books/${book.id}/dev`);

    // With a concept present the CTA clears (the sidebar "Development" nav
    // remains, but the overview's explicit CTA banner disappears).
    const withConcept = await createBookViaApi(request, {
      name: "BD Overview CTA 2",
      genre: "Fantasy",
    });
    await request.post(`/api/books/${withConcept.id}/documents`, {
      data: { type: "CONCEPT", title: "CONCEPT", content: "logline" },
    });
    await page.goto(`/books/${withConcept.id}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("link", { name: /run workflow/i }).first()
    ).toHaveCount(0);
  });
});