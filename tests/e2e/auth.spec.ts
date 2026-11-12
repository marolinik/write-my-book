import { test, expect } from "./fixtures";

test.describe("Authentication", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    // If already authenticated, Clerk may redirect to dashboard — both are valid
    await expect(page).toHaveURL(/login|sign-in|dashboard/);
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    // The suite sends the E2E bypass on every request, so /signup is treated as
    // authenticated and Clerk redirects to the dashboard — same contract as the
    // login test above.
    await expect(page).toHaveURL(/signup|sign-up|dashboard/);
  });

  test("unauthenticated user sees landing page at root", async ({ page }) => {
    // Without auth, root should show landing content
    await page.goto("/");
    // The h1 says "A Professional Publishing House" — match flexibly
    await expect(
      page.getByRole("heading", { level: 1 }).first()
    ).toBeVisible();
  });

  // P2-3: this test used to accept /dashboard as a pass while still sending
  // the e2e header, so it could never fail. Anonymous rejection is only
  // observable on a server without the dev bypass; under the e2e job's
  // DEV_AUTH_BYPASS it is proven by tests/unit/middleware-anonymous.test.ts.
  test("an anonymous request is refused", async ({ playwright, baseURL }) => {
    test.skip(
      process.env.DEV_AUTH_BYPASS === "true" && !!process.env.DEV_CLERK_ID,
      "the server signs every request in as the dev user (DEV_AUTH_BYPASS)"
    );
    // A fresh context: no e2e header, no cookies.
    const anonymous = await playwright.request.newContext({ baseURL, extraHTTPHeaders: {} });
    const api = await anonymous.get("/api/books", { maxRedirects: 0 });
    expect([401, 404]).toContain(api.status());
    const page = await anonymous.get("/dashboard", { maxRedirects: 0 });
    expect([302, 307, 308, 401]).toContain(page.status());
    if (page.status() !== 401) expect(page.headers()["location"] ?? "").toMatch(/login|sign-in/);
    await anonymous.dispose();
  });
});
