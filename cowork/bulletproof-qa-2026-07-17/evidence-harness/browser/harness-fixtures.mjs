// browser/harness-fixtures.mjs — Playwright fixtures that route page artifacts
// (trace.zip, screenshots, captured responses) into the evidence artifact store
// (W-F3 §1.2). A harness browser spec RECORDS into a sealed bundle and then asserts
// from the recording — so the judged artifact is the asserted artifact.
//
// Uses the existing @playwright/test dependency (no new dep).

import { test as base } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createManifest } from "../core/manifest.mjs";
import { buildRedactor } from "../core/redact.mjs";
import { createStore } from "../core/artifact-store.mjs";

const HARNESS_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EVIDENCE_ROOT = join(HARNESS_ROOT, "..", "evidence", "harness");

/**
 * Provides `capture` — a bound artifact store writing into a fresh browser bundle,
 * plus helpers to snapshot the current page and persist the trace after each test.
 */
export const test = base.extend({
  capture: async ({}, use, testInfo) => {
    const runId = `browser-${testInfo.title.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`;
    const bundleDir = join(EVIDENCE_ROOT, runId);
    mkdirSync(join(bundleDir, "raw"), { recursive: true });
    const redactor = buildRedactor();
    const manifest = createManifest(bundleDir);
    const store = createStore(bundleDir, { redactor, manifest });

    const api = {
      bundleDir,
      store,
      async screenshot(page, label) {
        const buf = await page.screenshot({ fullPage: true });
        return store.writeRaw(buf, { label: `shot-${label}`, kind: "screenshot", ext: ".png", meta: { label } });
      },
      async pageState(page, label) {
        const html = await page.content();
        return store.writeRaw(Buffer.from(html), { label: `dom-${label}`, kind: "dom-snapshot", ext: ".html", meta: { label } });
      },
      seal(verdictIndex, certifiable = true) {
        return manifest.seal({ runId, env: { browser: true, node: process.version }, scenarios: [], verdictIndex, certifiable, redactionPolicy: redactor.policyManifest() });
      },
    };
    await use(api);
  },
});

export const expect = test.expect;
