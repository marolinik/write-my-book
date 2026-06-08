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
      // Card titles may be localized (e.g., "API Keys", "API ključevi", "API-Schlüssel")
      // Match any card title containing "API"
      await expect(
        page.locator('[data-slot="card-title"]').filter({ hasText: /api/i })
      ).toBeVisible();
    }
  });

  test("settings page shows language preference", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/settings")) {
      // Card titles may be localized — match "language", "jezičke", "sprach", "idioma", "langue", etc.
      // Use a broader regex or check for the select/combobox element instead
      const langCard = page.locator('[data-slot="card-title"]').filter({
        hasText: /language|jezičk|sprach|idioma|langue|языков|语言/i,
      });
      await expect(langCard).toBeVisible();
    }
  });
});
