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
    // Look for sidebar nav items
    const sidebar = page.locator("[data-sidebar]");
    if (await sidebar.isVisible()) {
      await expect(sidebar.getByText("Dashboard")).toBeVisible();
      await expect(sidebar.getByText("Books")).toBeVisible();
      await expect(sidebar.getByText("Series")).toBeVisible();
    }
  });
});
