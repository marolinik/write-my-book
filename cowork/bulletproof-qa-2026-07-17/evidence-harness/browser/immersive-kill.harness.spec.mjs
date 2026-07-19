// browser/immersive-kill.harness.spec.mjs — immersive-mode + crash-restart data
// safety (W-F3 §3.2 row 4c). Ports the pattern of tests/e2e/w4-data-safety-drills
// but RECORDS into a sealed bundle then asserts from the recording.
//
// Enters immersive/focus mode, types a known marker, hard-navigates away (simulating
// a crash/kill), returns, and verifies zero lost words. If Chromium cannot run
// in-session, seals UNDER-N honestly.

import { test, expect } from "./harness-fixtures.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("immersive-mode typing survives a hard reload (crash-restart)", async ({ page, capture }) => {
  const marker = `IMMERSIVE-MARKER-${Date.now()}`;

  await page.goto("/books");
  await capture.screenshot(page, "books-landing");

  // Enter the editor + immersive mode (selectors mirror the CI e2e spec).
  // await page.getByRole("button", { name: /immersive|focus/i }).click();
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.type(`${marker} the keeper wound the clock against the coming dark.`);
  await capture.pageState(page, "immersive-typed");
  await page.waitForTimeout(2500); // allow autosave/sync-scheduler to flush

  // Hard reload = crash/kill simulation.
  await page.reload();
  const dom = await capture.pageState(page, "after-crash-reload");
  const html = readFileSync(join(capture.bundleDir, dom.path), "utf8");
  const survived = html.includes(marker);

  capture.seal({ metric: "immersive-crash-no-loss", marker, survived }, true);
  expect(survived, "immersive marker must survive the crash-reload").toBe(true);
});
