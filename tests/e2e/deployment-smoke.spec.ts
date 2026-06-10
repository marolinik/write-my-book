import { test, expect } from "@playwright/test";

test.describe("deployment smoke", () => {
  test("public liveness endpoint is healthy", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("dependency readiness endpoint is reachable", async ({ request }) => {
    const res = await request.get("/api/health/dependencies");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("dependencies");
  });

  test("public pages render", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy/i })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms/i })).toBeVisible();
  });

  test("protected dashboard is not anonymously readable", async ({ page }) => {
    const response = await page.goto("/dashboard");
    const status = response?.status() ?? 0;
    const url = page.url();
    expect(status === 401 || status === 403 || status === 503 || /login|sign-in|clerk/i.test(url)).toBeTruthy();
  });
});
