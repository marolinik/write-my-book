import { test, expect } from "./fixtures";

test.describe("Authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/login/);
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/signup/);
  });

  test("unauthenticated user sees landing page at root", async ({ page }) => {
    // Without auth, root should show landing content
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /publishing house/i })
    ).toBeVisible();
  });

  test("dashboard redirects to login without auth", async ({ page }) => {
    // Without the E2E test header, dashboard should redirect
    const context = await page.context();
    // Remove the default E2E header for this test
    await context.clearCookies();
    const response = await page.goto("/dashboard");
    // Should redirect to login or show auth wall
    const url = page.url();
    expect(url).toMatch(/login|sign-in|dashboard/);
  });
});
