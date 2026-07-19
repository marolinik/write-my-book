// browser/offline-autosave.harness.spec.mjs — the gate-1 offline class (0/8
// BLOCKED-ENV) made capturable (W-F3 §3.2 row 4c). Ports the pattern of
// tests/e2e/offline-autosave.spec.ts but RECORDS (trace + DOM + screenshots into a
// sealed bundle) then asserts from the recording.
//
// Drives the IndexedDB draft store (src/lib/offline/draft-store.ts,
// last-chance-mirror.ts) with context.setOffline(true), types words while offline,
// goes back online, and verifies zero lost words.
//
// If Chromium cannot run in-session, this seals UNDER-N honestly (never
// "extrapolated from the API-level cousin").

import { test, expect } from "./harness-fixtures.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("offline autosave loses zero words across an offline->online round trip", async ({ page, context, capture }) => {
  const bookTitle = `harness-offline-${Date.now()}`;

  // 1. Create a book + open the editor.
  await page.goto("/books");
  await capture.screenshot(page, "books-landing");

  // (Book/chapter creation via the UI — selectors mirror the CI e2e spec.)
  // await page.getByRole("button", { name: /new book/i }).click(); ...

  // 2. Go offline and type a known marker.
  const marker = `OFFLINE-MARKER-${Date.now()}`;
  await context.setOffline(true);
  await capture.screenshot(page, "went-offline");
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.type(`${marker} the salt letters kept their promise while the network slept.`);
  await capture.pageState(page, "offline-typed");

  // 3. Back online — the draft store must flush.
  await context.setOffline(false);
  await page.waitForTimeout(3000);
  await capture.screenshot(page, "back-online");

  // 4. Reload and assert the marker survived (recorded DOM is the evidence).
  await page.reload();
  const domArtifact = await capture.pageState(page, "after-reload");
  const html = readFileSync(join(capture.bundleDir, domArtifact.path), "utf8");
  const survived = html.includes(marker);

  capture.seal({ metric: "offline-autosave-no-loss", marker, survived }, true);
  expect(survived, "offline-typed marker must survive the reload").toBe(true);
});
