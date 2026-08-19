# Evidence-Capture Harness (W-F3)

Off-executor, tamper-evident evidence capture for the bulletproof-QA campaign.
Built to `w-f3-harness-design.md`. **Node built-ins only** in the credibility core
(`crypto`, `fs`) — probes/suites lazy-import existing deps (`pg`, `ioredis`,
`neo4j-driver`, `stripe`, `bullmq`, `@playwright/test`); **no new npm deps**. All
files are `.mjs`, outside `tsconfig` — **zero impact on the compiled app tree**.

## Why this exists

AGGREGATE-VERDICT §9.4: executors assembled their own evidence bundles, which
produced fabricated numbers (D-45: narrated "21/21 PASS" over raw `ok:false`),
fabricated quotes (D-40/D-49), self-talk in reports (D-50), a measurement outside
the worker-proof bracket (D-60), and unmet pre-registered Ns (§9.5). This harness
makes capture **mechanical, tamper-evident, and independent of any fix-executor**:
the dispatching agent's only freedom is *which suite* and *when*.

## The one command a judge runs

```
node cowork/bulletproof-qa-2026-07-17/evidence-harness/verify/verify-bundle.mjs <bundle-dir>
```

- **VERIFIED** (exit 0) — the hash chain is intact, every raw byte matches the
  manifest, every recorded number reproduces from raw, worker-proof brackets are
  consistent, narrative lints clean.
- **TAMPER-SUSPECT (seq=N)** (exit 2) — a raw byte, a manifest line, or a summary
  number changed after sealing. Score the bundle as if its claims are FALSE.
- **NON-CERTIFIABLE** (exit 3) — sealed honestly under a limit (`UNDER-N`, dirty
  tree, or a voided worker bracket). Partial results are real; the coverage claim
  is not.

It imports only `core/` + `assertions.mjs` — never suite code — so it verifies the
**record**, not the world. A context-free judge can run it with no repo knowledge.

## How integrity is guaranteed

1. **Content-addressed raw bytes.** Every HTTP body / DB-Redis-Neo4j / Stripe / SSE
   / worker-census artifact is written verbatim (post-redaction) and content-hashed
   *before* any assertion reads it (`core/artifact-store.mjs`). No `JSON.parse →
   re-stringify` round trip — that is a paraphrase.
2. **Hash-chained manifest.** `manifest.jsonl` is append-only; each line's `prev` is
   the sha256 of the previous line's exact bytes. Any edit/delete/insert of a raw
   file OR a manifest line breaks the chain from that point (`core/manifest.mjs`).
3. **Seal + git anchor.** `MANIFEST.json` pins `rootHash = sha256(manifest.jsonl)`
   plus a digest of `checks/summary.machine.json`. Committing the bundle anchors it
   to git's independent clock (team-lead does this; `run.mjs --git-anchor` automates
   it — **off by default**).
4. **Numbers only in `summary.machine.json`.** Every number/boolean is produced by
   `core/assertions.mjs` from on-disk raw, each with a `{artifact, path|byteRange,
   method}` source pointer. `verify-bundle` recomputes the whole summary from raw and
   diffs — a narrated number with no machine check behind it is definitionally
   uncited. (D-45 countermeasure.)
5. **Redaction before hashing.** Secrets are scrubbed to `[REDACTED:NAME]` *before*
   the artifact is hashed, so hashes are the hash of exactly what is on disk
   (`core/redact.mjs`, disclosed in `checks/redaction-policy.json`).
6. **Worker-proof brackets.** Every measurement sits in a bracket whose open/close
   OS censuses (+ optional BullMQ `getWorkers()` cross-check) must agree; PID-set
   drift voids the bracket. Inside/outside is a **monotonic** comparison — no
   timezone arithmetic (D-60 countermeasure). `core/worker-proof.mjs`.
7. **Fail-closed N.** A suite below its pre-registered N seals `UNDER-N /
   NON-CERTIFIABLE` and exits non-zero — never rounds up, never extrapolates.

## Directory map

```
evidence-harness/
  run.mjs                     # CLI: one command per run — preflight, execute suite, seal
  core/                       # credibility spine (Node built-ins only)
    clock, redact, manifest, artifact-store, jsonpath, assertions, scenario,
    prng, blind-pairing, http-capture, preflight, worker-proof, seed
  probes/                     # read-only snapshots (existing deps)
    db-snapshot, redis-snapshot, neo4j-snapshot, stripe-probe
  suites/                     # one file per suite (a suite = ordered capture steps)
    misquote, voice-flattening, continuity-precision, autosave-api,
    money-proration, money-batch-cap, graph-state, _lib
  browser/                    # Playwright capture (offline autosave, immersive, two-tab)
    playwright.harness.config.mjs, harness-fixtures, *.harness.spec.mjs
  scenarios/                  # committed pre-registered specs (one JSON per suite)
  corpora/                    # committed seed corpora + per-corpus manifest (to assemble)
  verify/                     # judge-side re-verification (imports core only)
    verify-bundle, verify-quotes
  selftest/                   # demo.mjs (tamper demo) + unit.mjs (node --test)
  docs/                       # judge-prompt snippet for W-G integration
```

## Capturing evidence during W-G re-judging

1. **Preconditions** (the runner hard-fails otherwise): app on `:3002` answering
   `/api/health` with `x-e2e-test-secret`; Postgres/Redis reachable; Neo4j when the
   suite needs it; **exactly one** worker in this checkout (proven by census); the
   product tree **committed** (dirty ⇒ pass `--allow-dirty`, which stamps the bundle
   `NON-CERTIFIABLE`). Certifiable runs happen on a tree at/after the relevant
   wave-merge commit — the manifest's git SHA records which contract was live.
2. **Seed harness users** (disjoint from personas — never touches `user_qa_p*`):
   `core/seed.mjs → seedHarnessUsers([{clerkId:"user_qa_h1",plan:"professional"}, …])`.
3. **Run one suite** (fresh bundle each time; never edits a prior bundle):
   ```
   node cowork/bulletproof-qa-2026-07-17/evidence-harness/run.mjs <suite-id> [--allow-dirty] [--neo4j]
   ```
   Suites: `misquote`, `voice-flattening`, `continuity-precision`, `autosave-api`,
   `money-proration`, `money-batch-cap`, `graph-state`. Long suites (misquote,
   batch) run in the background.
4. **Browser classes** (offline autosave / immersive-kill / two-tab):
   ```
   npx playwright test --config cowork/bulletproof-qa-2026-07-17/evidence-harness/browser/playwright.harness.config.mjs
   ```
5. **Hand to judges**: give them the bundle dir and the one-command verify above.
   Judge order: `raw/` first, `checks/summary.machine.json` second, `narrative/`
   last (context only). A non-`VERIFIED` bundle is scored as if its claims are false.
6. **Team-lead commits** each sealed bundle (git anchor). Executors never file a
   harness run against their own fix.

## Self-test (run anytime, no live infra)

```
node cowork/bulletproof-qa-2026-07-17/evidence-harness/selftest/demo.mjs   # tamper-detection demo
node --test cowork/bulletproof-qa-2026-07-17/evidence-harness/selftest/unit.mjs   # core unit tests
```

The demo captures a sample bundle, verifies it (VERIFIED), then mutates a raw byte,
a manifest line, and a summary number in turn — each caught as TAMPER-SUSPECT — then
restores and re-verifies (VERIFIED).

## Bundle layout (judge handoff)

```
<suiteId>-<yyyymmdd-hhmmss>-<git7>/
  MANIFEST.json          # seal: rootHash, env block, spec proof, verdict index, certifiable
  manifest.jsonl         # append-only hash chain (one line per artifact)
  raw/                   # content-addressed verbatim bytes
  checks/summary.machine.json   # ALL numbers, each with a source pointer
  checks/redaction-policy.json  # what was scrubbed
  scenarios/             # the pre-registered spec + its git proof
  sealed/                # blind keys (e.g. voice pairing) — open AFTER blind verdicts
  narrative/             # OPTIONAL, LLM-authored, read LAST; quote/number-linted
  VERIFY.md              # the one-command verify + read order
```
