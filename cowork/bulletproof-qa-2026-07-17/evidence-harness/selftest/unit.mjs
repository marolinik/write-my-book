// selftest/unit.mjs — unit tests for the credibility core (W-F3 T1/T6/T7).
//
// Uses Node's built-in test runner (no vitest, no touching tests/**). Run:
//   node --test cowork/bulletproof-qa-2026-07-17/evidence-harness/selftest/unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildRedactor } from "../core/redact.mjs";
import { createManifest, verifyChain, sha256Hex } from "../core/manifest.mjs";
import { createStore } from "../core/artifact-store.mjs";
import { jsonPath } from "../core/jsonpath.mjs";
import { byteSubstring, jsonPathEquals, numericBound, jsonPathCount, countAtLeast, createArtifactReader, deepEqual } from "../core/assertions.mjs";
import { mulberry32, shuffle, seedFromString } from "../core/prng.mjs";
import { extractHunks } from "../core/blind-pairing.mjs";
import { extractQuotes, extractUncitedNumbers } from "../verify/verify-quotes.mjs";

function tmp() {
  return mkdtempSync(join(tmpdir(), "wmb-harness-unit-"));
}

test("redact: scrubs secret before hashing and is idempotent", () => {
  const r = buildRedactor({ E2E_TEST_SECRET: "supersecretvalue123" }, { orkPath: "___none___" });
  const once = r.redact(Buffer.from("token=supersecretvalue123 end"));
  assert.equal(once.redactions, 1);
  assert.ok(once.bytes.toString().includes("[REDACTED:E2E_TEST_SECRET]"));
  assert.ok(!once.bytes.toString().includes("supersecretvalue123"));
  const twice = r.redact(once.bytes);
  assert.equal(twice.redactions, 0);
  assert.deepEqual(twice.bytes, once.bytes);
});

test("redact: detectSecrets reports a leak without persisting it", () => {
  const r = buildRedactor({ OPENROUTER_API_KEY: "ork-live-abcdef123456" }, { orkPath: "___none___" });
  const findings = r.detectSecrets(Buffer.from("leaked ork-live-abcdef123456 in body"));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, "OPENROUTER_API_KEY");
});

test("manifest: intact chain verifies; a single edited byte breaks it at the right seq", () => {
  const dir = tmp();
  const m = createManifest(dir);
  m.append({ kind: "a", meta: { i: 0 } });
  m.append({ kind: "b", meta: { i: 1 } });
  m.append({ kind: "c", meta: { i: 2 } });
  m.seal({ runId: "u", env: {}, scenarios: [], verdictIndex: {}, certifiable: true });
  assert.equal(verifyChain(dir).ok, true);

  const p = join(dir, "manifest.jsonl");
  const edited = readFileSync(p, "utf8").replace('"i":1', '"i":9');
  writeFileSync(p, edited);
  const v = verifyChain(dir);
  assert.equal(v.ok, false);
  assert.equal(v.firstDivergentSeq, 2); // line 1 changed -> line 2's prev mismatches
});

test("artifact-store: content-addressed, redaction reflected in bytes + manifest", () => {
  const dir = tmp();
  const redactor = buildRedactor({ E2E_TEST_SECRET: "zzz-secret-zzz" }, { orkPath: "___none___" });
  const manifest = createManifest(dir);
  const store = createStore(dir, { redactor, manifest });
  const rec = store.writeRaw(Buffer.from("body zzz-secret-zzz body"), { label: "x", kind: "http-res" });
  assert.equal(rec.redactions, 1);
  const onDisk = readFileSync(join(dir, rec.path), "utf8");
  assert.ok(!onDisk.includes("zzz-secret-zzz"));
  assert.equal(sha256Hex(readFileSync(join(dir, rec.path))), rec.sha256);
});

test("jsonpath: member, index, wildcard", () => {
  const obj = { a: { b: 5 }, arr: [{ f: 1 }, { f: 2 }] };
  assert.deepEqual(jsonPath(obj, "$.a.b"), [5]);
  assert.deepEqual(jsonPath(obj, "$.arr[0].f"), [1]);
  assert.deepEqual(jsonPath(obj, "$.arr[*].f"), [1, 2]);
});

test("assertions: byteSubstring / jsonPathEquals / numericBound / countAtLeast", () => {
  const dir = tmp();
  writeFileSync(join(dir, "a.bin"), "the keeper wound the clock");
  writeFileSync(join(dir, "b.json"), JSON.stringify({ ok: true, n: 7 }));
  // mimic the raw/ layout
  const read = (rel) => readFileSync(join(dir, rel));

  const bs = byteSubstring(read, { id: "1", needle: "wound the clock", artifact: "a.bin" });
  assert.equal(bs.pass, true);
  assert.deepEqual(bs.source.byteRange, [11, 26]);

  const je = jsonPathEquals(read, { id: "2", artifact: "b.json", path: "$.ok", expected: true });
  assert.equal(je.pass, true);

  const nb = numericBound(read, { id: "3", artifact: "b.json", path: "$.n", max: 10, min: 1 });
  assert.equal(nb.pass, true);
  assert.equal(nb.observed, 7);

  writeFileSync(join(dir, "c.json"), JSON.stringify({ lines: { data: [1, 2, 3] } }));
  const jc = jsonPathCount(read, { id: "3b", artifact: "c.json", path: "$.lines.data[*]", min: 1 });
  assert.equal(jc.pass, true);
  assert.equal(jc.observed, 3);

  const ca = countAtLeast({ id: "4", observed: 42, declaredN: 100, unit: "findings" });
  assert.equal(ca.pass, false);
  assert.equal(ca.verdict, "UNDER-N");
});

test("prng: deterministic + reproducible shuffle", () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  assert.equal(a(), b());
  const s1 = shuffle([1, 2, 3, 4, 5], mulberry32(seedFromString("x")));
  const s2 = shuffle([1, 2, 3, 4, 5], mulberry32(seedFromString("x")));
  assert.deepEqual(s1, s2);
});

test("blind-pairing: extractHunks finds only changed paragraphs", () => {
  const before = "Para one unchanged.\n\nPara two original.";
  const after = "Para one unchanged.\n\nPara two EDITED.";
  const hunks = extractHunks(before, after);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].before, "Para two original.");
});

test("verify-quotes: extractQuotes >= min len; uncited numbers flagged", () => {
  const q = extractQuotes('He said "this is a long enough quote to count" and "short".');
  assert.equal(q.length, 1);
  const viol = extractUncitedNumbers("We passed 21/21 tests.", new Set());
  assert.equal(viol.length, 1);
  const ok = extractUncitedNumbers("We passed 21/21 tests (check:anchor-1).", new Set(["anchor-1"]));
  assert.equal(ok.length, 0);
});

test("deepEqual: order-independent object equality", () => {
  assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(deepEqual([1, 2], [2, 1]), false);
});
