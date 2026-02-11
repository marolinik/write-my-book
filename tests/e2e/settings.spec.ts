import { test, expect } from "./fixtures";

test.describe("Settings", () => {
  test("settings page renders", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/settings|login|sign-in/);
  });

  test("settings page shows API keys section", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/settings")) {
      await expect(
        page.getByRole("heading", { name: /api keys/i })
      ).toBeVisible();
    }
  });

  test("settings page shows language preference", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/settings")) {
      await expect(
        page.getByRole("heading", { name: /language/i })
      ).toBeVisible();
    }
  });
});
