# Gate 4 (writer-trust: money never overruns) — deterministic regression lock

**State: MET (with a documented, reviewed bounded-overshoot floor).**

## What was proven

All five Gate-4 blockers are present in the tree **and** guarded by deterministic
offline tests — except D-45, whose only guard is a live Stripe test-mode harness
(honest BLOCKED-ENV gap, no offline lock possible without a Stripe key):

| Blocker | Fix at | Deterministic guard | Gap |
|---|---|---|---|
| D-06 double checkout | `fc0c201` already-subscribed block | `billing-checkout-guard.test.ts` | no |
| Z8 idempotent spend ledger | `7709b08` already-billed guard + `SET NX batch:{id}:counted:{sessionId}` gating incrbyfloat/breaker + gated `UsageRecord.create` | `agent-worker-batch-idempotency.test.ts` | no |
| D-44 BYOK usage $0 | `dc912fa` registry attribution rollup | `usage-aggregation.test.ts` + `api-keys-usage-route.test.ts` | no |
| D-36 billed run fakes completion | `99c17f4` + `486bae1` orchestrator resolves success:false; worker marks failed, suppresses complete publish | `agent-worker-failed-session.test.ts` + `orchestrator-provider-failure.test.ts` | no |
| D-45 W6 proration | `6146293` + `49b1c82` real Stripe test-mode harness | `harness/w6-proration.mjs` (**live Stripe only**) | **YES (BLOCKED-ENV)** |

Audit guard suites re-run in tree: **54/54, exit 0**.

## The one-worker "money never overruns" invariant (P4 Priya's un-run Power step)

P4 was HALTED before her at-cap Power step, so the money-side cap-halt was never
proven live (spend was $0.105, nowhere near a $10 cap). This lock is the buildable
substitute.

**New: `tests/unit/agent-worker-one-worker-overrun.test.ts` (5 tests).** Drives the
REAL `processAgentJob` for 8 children ($3 each) over a $10 cap on ONE worker,
strictly sequential (`for … await` = concurrency 1), store-backed in-memory Redis
honoring `SET NX` + `incrbyfloat`, mock orchestrator injecting each child's scripted
spend into the shared cost tracker `onComplete` reads.

- **No real bug.** On a single worker the pre-child gate (`shouldRunBatchChild`
  reading `batch:{id}:spent`/`:halted`) refuses new children once `spent >= cap`;
  `onComplete` sets `:halted` when cumulative `spent >= cap`. Because the ledger
  commits at completion and the gate is checked at dispatch, the cap-crossing child
  is admitted *before* its spend lands → a **bounded** overshoot of at most one
  per-child cost (`cap + maxPerChildCost`), NOT a runaway to Σall.
- **RED capture** (naive `spend <= cap`): `expected 12 to be less than or equal to
  10` — the honest bounded $12-on-$10 overshoot (one $3 child).
- **GREEN**: assertion corrected to the reviewed bound `cap <= spent <=
  cap+childCost AND spent < Σall`, plus `toBeCloseTo($12, 5)` exact pin.

## Verify (Fable adversarial, model=fable) — APPROVE, blocking=false

- Drives real worker (imports `processAgentJob` from `@/lib/queue/agent-worker`),
  concurrency genuinely 1, Redis mock honors `SET NX` (null on existing) + accumulating
  `incrbyfloat`.
- **Honesty audit CONFIRMED** the overshoot is reviewed design, not a relabeled
  runaway: `src/lib/agents/batch-budget.ts:24-28` ("bounds the GATE, not total
  spend"), `docs/mission/BATCH-SPEC.md:340-344` §4.5 ("Why the weaker bound is the
  honest one"), and the independent pre-existing Z9 audit
  (`evidence/money-path-Z8-Z12.md:63-84`) which already ruled the overshoot
  NOT-a-bug and corrected the bound to `cap + concurrency·maxPerChild` (= `cap + 1
  child` at concurrency 1 — exactly what this test asserts).
- **RED-repro**: forcing `shouldRunBatchChild` to always admit → `expected 24 to be
  less than or equal to 13` (spend ran to full Σall=$24) + skip-list failed. Second
  break (no-op cost-halt) reddened the halted-flag test while the spent-gate held
  spend at $12 — defense-in-depth confirmed. Both restored byte-exact, suite green.
- **Bound tight**: a 2-child overshoot ($15) fails both assertions.
- **Scope**: pure-additive, one test file, no src modified.

## Founder caveat (does NOT block Gate-4 MET)

True *zero*-overshoot requires Z9's optional fix (b): reserve-then-spend (reserve
`perChildCap` via `incrbyfloat` at admit, refund delta at completion) — a source
change. This lock pins the current reviewed design (bounded ≤ one child); it does
not settle whether to eliminate the bounded overshoot. Logged for the founder list.
