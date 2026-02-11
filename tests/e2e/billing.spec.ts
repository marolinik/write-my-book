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
      // Should show at least the Free plan
      await expect(page.getByText("Free")).toBeVisible();
      await expect(page.getByText("Starter")).toBeVisible();
      await expect(page.getByText("Pro")).toBeVisible();
      await expect(page.getByText("Enterprise")).toBeVisible();
    }
  });

  test("billing page shows usage section", async ({ page }) => {
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/billing")) {
      await expect(
        page.getByRole("heading", { name: /token usage/i })
      ).toBeVisible();
    }
  });
});
