import { test, expect } from "@playwright/test";

/**
 * O7 / D-203 — a Radix `useId` hydration mismatch was reported in the console on
 * every page load in development (`_R_33e…` vs `_R_or…`). The suspicion was that
 * it is a development-only artifact of the Turbopack overlay, which nobody had
 * confirmed, so the defect sat in the backlog as "suspected".
 *
 * This is the confirmation, and afterwards the guard: load the real surfaces and
 * fail if React reports a hydration mismatch. Run it against a PRODUCTION build
 * (`next build && next start`) to answer the original question; against a dev
 * server it documents whatever dev does.
 *
 *   npm run build && npx next start -p 3100
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npx playwright test hydration-console
 */

/** Messages React uses for a server/client markup disagreement. */
const HYDRATION_PATTERNS = [
  /hydration failed/i,
  /did not match|didn't match/i,
  /text content does not match/i,
  /server rendered html/i,
  /hydrating/i,
];

const PAGES = [
  { name: "dashboard", path: "/dashboard" },
  { name: "books", path: "/books" },
  { name: "settings", path: "/settings" },
];

// The dev server reproduces the mismatch on roughly one load in four, so this
// spec is opt-in: a flaky failure in the default suite would train everyone to
// ignore it. Run it deliberately, and always against a production build when
// answering "is this dev-only?".
const AUDIT = process.env.HYDRATION_AUDIT === "1";

for (const page of PAGES) {
  test(`${page.name} hydrates without a mismatch`, async ({ page: browserPage }) => {
    test.skip(!AUDIT, "set HYDRATION_AUDIT=1 to run the hydration audit");
    const hydrationErrors: string[] = [];

    browserPage.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const text = message.text();
      if (HYDRATION_PATTERNS.some((pattern) => pattern.test(text))) {
        hydrationErrors.push(text);
      }
    });

    // A React hydration mismatch is also reported through window.onerror in
    // some builds, so catch page errors too.
    browserPage.on("pageerror", (error) => {
      if (HYDRATION_PATTERNS.some((pattern) => pattern.test(error.message))) {
        hydrationErrors.push(error.message);
      }
    });

    await browserPage.goto(page.path, { waitUntil: "networkidle" });
    // Hydration happens after first paint; give React a beat to complain.
    await browserPage.waitForTimeout(1500);

    expect(
      hydrationErrors,
      `hydration mismatch on ${page.path}:\n${hydrationErrors.join("\n")}`
    ).toEqual([]);
  });
}
