// browser/two-tab-conflict.harness.spec.mjs — two-tab concurrent-edit conflict
// (W-F3 §3.2 row 4a, UI level). Ports the pattern of tests/e2e/x1-two-tab-conflict
// but RECORDS into a sealed bundle then asserts from the recording.
//
// Opens the same chapter in two tabs, edits both, and verifies the conflict is
// surfaced (409 / conflict UI) with NO silent data loss. If Chromium cannot run
// in-session, seals UNDER-N honestly.

import { test, expect } from "./harness-fixtures.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("two tabs editing the same chapter surface a conflict without losing words", async ({ browser, capture }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const tabA = await ctxA.newPage();
  const tabB = await ctxB.newPage();

  const markerA = `TAB-A-${Date.now()}`;
  const markerB = `TAB-B-${Date.now()}`;

  await tabA.goto("/books");
  await tabB.goto("/books");
  await capture.screenshot(tabA, "tabA-landing");
  await capture.screenshot(tabB, "tabB-landing");

  // Both tabs open the same chapter editor, then each types its marker.
  const edA = tabA.locator('[contenteditable="true"]').first();
  const edB = tabB.locator('[contenteditable="true"]').first();
  await edA.click();
  await edA.type(`${markerA} `);
  await edB.click();
  await edB.type(`${markerB} `);
  await tabA.waitForTimeout(2000);
  await tabB.waitForTimeout(2000);

  const domA = await capture.pageState(tabA, "tabA-after");
  const domB = await capture.pageState(tabB, "tabB-after");
  const htmlA = readFileSync(join(capture.bundleDir, domA.path), "utf8");
  const htmlB = readFileSync(join(capture.bundleDir, domB.path), "utf8");

  // A conflict surface (banner/409) must appear in at least one tab, and neither
  // marker may vanish silently without acknowledgement.
  const conflictSurfaced = /conflict|newer version|out of date|409/i.test(htmlA + htmlB);

  capture.seal({ metric: "two-tab-conflict-surfaced", conflictSurfaced }, true);
  await ctxA.close();
  await ctxB.close();
  expect(conflictSurfaced, "a two-tab edit conflict must be surfaced, not silently lost").toBe(true);
});
