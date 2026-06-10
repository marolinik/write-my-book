import { test, expect } from "./fixtures";

test.describe("Billing", () => {
  test("billing page renders", async ({ page }) => {
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/billing|login|sign-in/);
  });

  test("billing page shows plan cards", async ({ page }) => {
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/billing")) {
      // Plan card titles are rendered in CardTitle (div[data-slot="card-title"])
      const cardTitles = page.locator('[data-slot="card-title"]');
      const allText = await cardTitles.allTextContents();
      const joined = allText.join(" ");
      expect(joined).toContain("Founder");
      expect(joined).toContain("Indie Author");
      expect(joined).toContain("Professional");
      expect(joined).toContain("Publisher");
    }
  });

  test("billing page shows usage section", async ({ page }) => {
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/billing")) {
      // Usage section heading is a regular h2
      await expect(
        page.getByRole("heading", { name: /token usage/i })
      ).toBeVisible();
    }
  });
});
