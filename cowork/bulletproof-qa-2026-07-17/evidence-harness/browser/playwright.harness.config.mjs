// browser/playwright.harness.config.mjs — dedicated config for harness capture
// specs (W-F3 §1.2). Kept SEPARATE from the repo's playwright.config.ts so harness
// artifacts (trace.zip, screenshots) and pass/fail never mingle with the CI e2e
// suite. Harness specs RECORD (trace + raw responses) then assert from the recording;
// CI specs only assert.
//
// Uses the existing @playwright/test dependency (no new dep). Run:
//   npx playwright test --config cowork/bulletproof-qa-2026-07-17/evidence-harness/browser/playwright.harness.config.mjs

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.HARNESS_BASE_URL || "http://localhost:3002";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.harness\.spec\.mjs$/,
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "playwright-harness-report.json" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      "x-e2e-test-secret": process.env.E2E_TEST_SECRET ?? "",
      "x-e2e-clerk-id": process.env.HARNESS_CLERK_ID ?? "user_qa_h5",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
