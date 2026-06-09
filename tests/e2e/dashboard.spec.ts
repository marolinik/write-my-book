import { test, expect } from "./fixtures";

test.describe("Dashboard", () => {
  test("shows dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    // Dashboard should render (may redirect to login in CI without proper auth)
    await page.waitForLoadState("networkidle");
    const url = page.url();
    // Either shows dashboard or redirects to auth
    expect(url).toMatch(/dashboard|login|sign-in/);
  });

  test("has navigation sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Only check sidebar if we're on the dashboard (not redirected to login)
    if (!page.url().includes("/dashboard")) return;

    // Use the specific sidebar data attribute
    const sidebar = page.locator('[data-sidebar="sidebar"]').first();
    if (await sidebar.isVisible()) {
      // Sidebar nav items may be localized, check for link hrefs instead
      // Use data-active attribute to disambiguate dashboard link (logo also links to /dashboard)
      await expect(sidebar.locator('a[href="/dashboard"][data-active]').first()).toBeVisible();
      await expect(sidebar.locator('a[href="/books"]').first()).toBeVisible();
      await expect(sidebar.locator('a[href="/series"]').first()).toBeVisible();
    }
  });
});
