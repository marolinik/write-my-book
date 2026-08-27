import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated/build artifacts and local scratch files:
    "src/generated/**",
    "dist-worker/**",
    "coverage/**",
    "uat-screenshots/**",
    // Generated test artifacts (playwright runs write these).
    "playwright-report*/**",
    "test-results/**",
    // One-shot QA campaign evidence harnesses / scripts (not product code).
    "cowork/**",
    "tmp-*.js",
    "tmp-*.ts",
  ]),
  {
    rules: {
      // React Compiler diagnostics are valuable migration signals, but the
      // current app predates those rules. Keep them visible without blocking
      // production builds; Next build/typecheck remains the hard gate.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",

      // Legacy codebase cleanup signals. Warnings keep CI informative while
      // allowing production hardening to proceed incrementally.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
