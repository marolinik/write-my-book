import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only. E2E lives under tests/e2e and is run by Playwright
// (playwright.config.ts, testDir ./tests/e2e) — kept strictly separate so the
// two runners never pick up each other's specs.
export default defineConfig({
  test: {
    environment: "node",
    // Component/hook tests that need a DOM opt in per-file via the
    // `// @vitest-environment jsdom` pragma — the default stays node.
    // tests/contracts: lint-like text checks that run no app code (P2-70).
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/contracts/**/*.test.ts"],
    setupFiles: ["./tests/setup/pin-env.ts"],
    // Heavy modules are imported in beforeAll; 10 s is too short on a busy runner.
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage/unit",
      reporter: ["text-summary", "json-summary", "html"],
      // Coverage is scoped to the whole server surface — the business logic
      // under src/lib/** and every API route under src/app/api/** — so the
      // reported number reflects REAL gaps, not just the handful of money-path
      // modules that already have tests (Band D #17). Most of this surface is
      // still untested; that is intentional and visible.
      include: ["src/lib/**", "src/app/api/**"],
      // P2-70 / D14 (Wave 5 Task 11): a floor that only ever rises. Measured
      // 2026-11-12 over the full suite: lines/statements 81.65%, branches
      // 79.40%, functions 78.53%. Each floor is one point under the measured
      // value rounded down, because CI's gate skips the pandoc-dependent
      // integration tests that the measurement ran. Raise, never lower.
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 78,
        functions: 77,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component, which
      // is exactly its job in the app and exactly wrong in a unit test. The
      // marker still guards the real build; here it is a no-op.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
