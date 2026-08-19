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
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage/unit",
      reporter: ["text", "html"],
      // Coverage is scoped to the whole server surface — the business logic
      // under src/lib/** and every API route under src/app/api/** — so the
      // reported number reflects REAL gaps, not just the handful of money-path
      // modules that already have tests (Band D #17). Most of this surface is
      // still untested; that is intentional and visible.
      include: ["src/lib/**", "src/app/api/**"],
      // No hard `thresholds` is set on purpose: enforcing a floor here would
      // red the CI test gate on the large existing gaps this broadened scope
      // now exposes. Ratchet a floor up later (e.g. thresholds.lines) once
      // coverage climbs, starting at/below the then-current measured level.
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
