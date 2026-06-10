import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.SMOKE_BASE_URL;

if (!baseURL) {
  throw new Error("Set PLAYWRIGHT_BASE_URL or SMOKE_BASE_URL for deployment smoke tests.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /deployment-smoke\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-deployment" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
