import { test as base } from "@playwright/test";

export const test = base.extend({
  // Add custom fixtures here as needed
});

export { expect } from "@playwright/test";

/** Helper to navigate with E2E test auth bypass. */
export async function navigateAuthenticated(
  page: import("@playwright/test").Page,
  path: string
) {
  await page.goto(path);
}
