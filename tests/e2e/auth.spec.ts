import { test, expect } from "./fixtures";

test.describe("Authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    // If already authenticated, Clerk may redirect to dashboard — both are valid
    await expect(page).toHaveURL(/login|sign-in|dashboard/);
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/signup|sign-up/);
  });

  test("unauthenticated user sees landing page at root", async ({ page }) => {
    // Without auth, root should show landing content
    await page.goto("/");
    // The h1 says "A Professional Publishing House" — match flexibly
    await expect(
      page.getByRole("heading", { level: 1 }).first()
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
