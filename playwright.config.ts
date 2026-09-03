import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Deployment smoke tests assume real auth (no dev bypass, no e2e header)
  // — they run via playwright.deployment.config.ts only
  testIgnore: /deployment-smoke\.spec\.ts/,
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    // IP literal, not "localhost": Chromium's built-in resolver needs a hosts
    // entry and Windows boxes exist where hosts lost the `localhost` line,
    // while Node's fetch (API fixture) silently falls back — the split
    // page-fail/API-pass pattern this default prevents.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
    // Local e2e talks to the local dev server only; force direct
    // connections, the system-free resolver path, and an unsandboxed
    // browser so restricted CI containers / hardened Windows boxes (where
    // Chromium's sandboxed network utility process cannot open sockets —
    // misreported as ERR_NAME_NOT_RESOLVED for every URL, even IP literals)
    // run identically instead of flaking on environment.
    launchOptions: {
      chromiumSandbox: false,
      args: ["--no-proxy-server", "--disable-async-dns", "--disable-dev-shm-usage"],
    },
    extraHTTPHeaders: {
      "x-e2e-test-secret": process.env.E2E_TEST_SECRET || "test-secret",
    },
  },
  projects: [
    // Project-level testIgnore REPLACES the top-level one, so the
    // deployment-smoke exclusion must be repeated here.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/deployment-smoke\.spec\.ts/, /mobile-.*\.spec\.ts/],
    },
    // Mobile viewport — runs ONLY the mobile-* specs; everything else stays
    // on desktop viewports.
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-.*\.spec\.ts/,
    },
    // Run Firefox & WebKit only in CI
    ...(process.env.CI
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
            testIgnore: [/deployment-smoke\.spec\.ts/, /mobile-.*\.spec\.ts/],
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
            testIgnore: [/deployment-smoke\.spec\.ts/, /mobile-.*\.spec\.ts/],
          },
        ]
      : []),
  ],
  webServer: {
    command: "npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
