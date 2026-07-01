import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only. E2E lives under tests/e2e and is run by Playwright
// (playwright.config.ts, testDir ./tests/e2e) — kept strictly separate so the
// two runners never pick up each other's specs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage/unit",
      reporter: ["text", "html"],
      // Focus coverage on the money/data-path modules under test (Tier 2.6).
      include: [
        "src/lib/agents/budget.ts",
        "src/lib/llm/model-registry.ts",
        "src/lib/billing/plan-gating.ts",
        "src/lib/documents/version-manager.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
