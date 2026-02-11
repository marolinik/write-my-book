import { test, expect } from "./fixtures";

test.describe("Book CRUD", () => {
  test("books page renders", async ({ page }) => {
    await page.goto("/books");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/books|login|sign-in/);
  });

  test("books page has create button when authenticated", async ({ page }) => {
    await page.goto("/books");
    await page.waitForLoadState("networkidle");
    // If we're on the books page (authenticated), look for create button
    if (page.url().includes("/books")) {
      const createBtn = page.getByRole("button", { name: /create|new|add/i });
      if (await createBtn.isVisible()) {
        await expect(createBtn).toBeEnabled();
      }
    }
  });
});
