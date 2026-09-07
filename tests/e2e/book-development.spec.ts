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
});