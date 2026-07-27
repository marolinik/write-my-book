# Open Founder Decisions — post fix-wave (2026-07-20)

State: every QA-closable defect + gate harness is landed or in-flight. The residue
below is **not** executor-closable — each item is either a product ruling (behavior
tradeoff) or blocked on an environment the campaign cannot provision (API key / dev
server / live third-party). Listed so the founder can rule in one pass, after which
the #47 re-judge runs.

## FOUNDER RULINGS — 2026-07-20 (interview)
- **A1 Gate-1 ≤150ms window → DOCUMENT THE FLOOR.** No code. Gate-1 reported as
  "no total loss; ≤150ms tail on hard-kill within throttle." Strong-bar `it.fails`
  kept as permanent characterization.
- **A2 `location_conflict` (D-19b) → KEEP GATED (default OFF).** No code (already
  OFF). #55 fix 8 resolved as "hold." Correctness-behind-gate proven (Gate-3); not
  shipped on-by-default (precision-sensitive, FP risk).
- **A3 D-25 series sidebar → INTENTIONAL (prior-book canon only).** No code. #55 fix
  9 resolved. Document the scope split: sidebar = strictly-prior-book canon; the
  current book's live state is the in-book continuity net's job.
- **A4 residuals a–d → ALL PROMOTED TO FIX-NOW** (founder reversed the defer
  recommendation): D-47 version/CAS on raw writes, fix-7d death-event model, D-89
  alias-fold class-2, D-49/50 unquoted-strip guard. Dispatched as 3 Opus lanes
  (D-47 · graph[fix-7d+D-89] · D-49/50), each TDD RED-first + Fable-verified +
  STOP-and-report if a fix breaks a real writer flow. Each carries the flagged risk
  (D-47 versionless-writer breakage, D-89 false-merge) → mitigated in-lane.
  **LANDED 2026-07-20:** D-49/50 `679b628`, D-47 `3098e85` (+ e2e ripple the
  verifier caught: 2 offline-autosave drills + 1 ui-flows seed relabeled
  changeSource "system"), fix-7d+D-89 `add6645`. All Fable-verified
  APPROVE/blocking=false. fix-7d took a REJECT→remediate cycle (ON MATCH FP-A
  backfill hole on legacy-null Events) before its clean re-verify. #55 CLOSED.
- **Re-judge → HOLD** until A4 lands + BLOCKED-ENV resolved.
  A4 now landed; residue = the 3 BLOCKED-ENV runs (voice N≥100, extraction
  recall, live e2e). Env provisioned (persona + harness BYOK seeded).

## BLOCKED-ENV provisioning answer (founder asked "what key in .env")
The writer/judge LLM key is **NOT an `.env` var** — the app is strict BYOK: every
agent/line-edit call decrypts the signed-in user's *stored* key (`decryptApiKey`,
`src/app/api/books/[id]/agent/route.ts:238`), never a platform fallback. Provision
it **in the app**: run the dev server, sign in as the QA persona, Settings → API
Keys, paste **one OpenRouter key** (`sk-or-…`) — routes Claude (judges) + qwen3.6
(writer) + all providers via OpenRouter's Anthropic-compatible endpoint.
`.env` vars that ARE needed:
- `OPENAI_API_KEY=sk-…` — **required** for embeddings (`text-embedding-3-small`,
  `src/lib/vector/embeddings.ts:23`) = the continuity-extraction recall leg. Absent →
  indexing gated off, recall unmeasurable.
- `ANTHROPIC_API_KEY=sk-ant-…` — **optional**, adds a stronger comparison arm to the
  voice probe (labels `qwen36+anthropic` vs `openrouter-qwen36`).
- Dev server on **:3002** — harness/e2e read `HARNESS_BASE_URL` / `PLAYWRIGHT_BASE_URL`.
Minimal to unblock Gate-2 voice N≥100 + extraction recall + live e2e: (1) dev server
on :3002, (2) `OPENAI_API_KEY` in `.env`, (3) one OpenRouter key in the persona's Settings.

---

## A. Product rulings (behavior tradeoffs — held, NOT flipped by QA)

### A1. Gate-1 zero-loss residual — close the ≤150ms window, or document the floor?
- **What's proven:** offline durability EXISTS and is now TESTED (8/8 W4 disaster
  classes deterministic GREEN; total-loss regression floor held). Harness:
  `tests/unit/offline-autosave-zeroloss.test.tsx`.
- **The gap:** a bounded **≤150ms tail** of keystrokes can still be lost on a hard
  kill *inside the throttle window* — machine-proven (`it.fails` strong-bar test #3).
  So Gate-1 is **PARTIAL** on its literal "zero words lost" bar.
- **Option 1 (close it):** mirror every keystroke instead of throttled.
  - Reverses reviewed decision **e26a0e3**; rewrites throttle-count assertions in
    `use-draft-buffer-mirror.test.tsx`; delete `.fails` from strong-bar #3.
  - **RISK:** per-keystroke `JSON.stringify` of a ~900KB doc is likely NOT sub-ms —
    the throttle probably exists to stop large-doc editor jank. Trades a rare bounded
    crash-loss for guaranteed per-keystroke cost on big chapters.
- **Option 2 (document floor):** accept ≤150ms bounded-partial-loss as the Gate-1
  floor; keep strong-bar #3 as permanent characterization. Gate-1 reported as
  "no total loss; ≤150ms tail on hard-kill within throttle."
- **Recommendation:** Option 2 unless a large-doc keystroke-cost benchmark shows the
  per-keystroke mirror stays <2ms at 1MB. The bounded loss is rare + small; the jank
  is every session.

### A2. `location_conflict` detector — ship on by default? (#55 fix 8 = D-19b)
- **What's proven:** Gate-3 corpus proves the detector CORRECT behind its gate
  (2 TP, precision 1.00 / recall 1.00 with `ENABLE_LOCATION_CONFLICT_CHECK=true`).
  Default-OFF confirmed intact (`graph-queries.ts:39`).
- **The ruling:** flipping it on by default changes what every writer sees. Scene-level
  location conflict is precision-sensitive; on-by-default risks false-positive
  continuity flags. Correctness-behind-gate ≠ authority to ship on.
- **Held OFF.** Founder call to enable + accept the FP profile, or keep gated.

### A3. D-25 Selena sidebar finding ruling (#55 fix 9) — founder call, no safe code.

### A4. Registered residuals needing a ruling (#55 a–d, accepted, no code):
- **D-47** unversioned raw-PUT last-write-wins: making `expectedVersion` mandatory
  breaks legacy/agent/import writers (real editor flow already CAS-protected `29af79e`).
- **fix-7(d)** death-anchor model gap: adding a reified death Event/DIES_IN edge = new
  graph model shape (deathChapter coalesce already monotonic, D-79 anchor stable).
- **D-89** class-1-only vs class-1+2 alias-fold design tension (arrival-order shared
  nickname fold).
- **D-49/D-50** R1 residual: unquoted writer prose with an em-dash retraction can clip
  in a report (never touches a writer doc). Future guard: skip `reads:`/`Original:` spans.

---

## B. BLOCKED-ENV ceiling (no fabrication — harness built, run deferred)

These cap the achievable score until the environment is provisioned:
- **Gate-2 voice-integrity probe N≥100** — needs a live LLM API key. Harness ready;
  N≥100 statistical run deferred.
- **Continuity extraction recall** — LLM entity-extractor leg; detection layer is
  CLOSED deterministically (Gate-3), extraction recall needs API key.
- **Live e2e data-safety drills** — `offline-autosave.spec.ts` /
  `w4-data-safety-drills.spec.ts` need dev server on :3002.

## C. Deploy gates (founder-decision list, ops)
- **C0** prod schema push (`npm run db:push:prod` — batch + 4.8/4.4/4.2 tables).
- **C2/C2b** restore + object-storage drills. **C3** live Stripe/Clerk round-trip.
- **Z8** worker re-spend checkpointing. **D-08** managed no-key tier (biggest grade-lifter).

---

## How this gates #47 re-judge
The re-judge measures QA-closable product quality. A/B/C above are founder/ops calls,
not QA fixes. Resolve by: (1) founder rules A1–A4, and (2) founder either provisions
the API key + :3002 for B, or accepts B/C as documented ceiling — then re-judge runs
against the landed tree. Do NOT re-judge before #53/#54/#56 land and A-items are ruled
or explicitly deferred.

---

# D. Founder calls accumulated in the 2026-07-27 re-judge campaign

Sections A–C above are the 2026-07-19 vintage. This section is the register of
founder/product calls that the v2/v3/v4 blind panels and the fix lanes reached but
deliberately did **not** decide in code. Each entry names the grade floor it bounds,
so the founder can see which decision buys which lift.

## D1. Discuss reasoning-slot reroute — **the current P1/P6 floor term** (D-176)
- **Proven on camera** (46-series, `evidence/p1-maya-rejudge/`): a discuss turn's
  time-to-first-text is **19–36s**, measured by `Server-Timing`. Cadence after first
  text is excellent (32ms median distinct-arrivals, faster than ghost-text's 141ms);
  the settle tail is 279–984ms. The wait is **entirely pre-first-token**: the model
  reasons before it speaks.
- **What code already did** (`391a165`, `a163f11`): D-176 liveness chrome — elapsed
  counter, 8s/40s phase bands, heartbeat dot, and a Cancel that aborts through both
  the streamed and blocking paths with a pre-settle 499. The wall is now **honest and
  escapable**. It is not shorter.
- **Why code cannot shorten it:** discuss is served by a reasoning slot
  (qwen3.6-thinking / opus class). The reasoning phase emits no text by construction,
  and a server-side heartbeat before first text would break the honest-409-before-any-byte
  contract that D5 Stage-1 was built on (`discuss-stream.ts`).
- **The only term-shortener:** route discuss turns to a **non-reasoning fast slot**
  (estimated ttft ~2s, i.e. a ~10–18× cut), accepting whatever craft-quality delta
  that costs on editorial reasoning. Alternative: keep the reasoning slot and let the
  counter+cancel be the answer, in which case **D5/D-176 is a permanent ~6.5–7.0 cap
  on P1 and P6** — three of three judges pinned it in both v3 panels.
- **Recommendation:** run a small A/B on real findings (reasoning vs fast slot, same
  prompts, blind craft rating). If the craft delta is small, reroute; if large, make
  the slot a per-turn writer choice ("quick take" vs "think it through") rather than
  a global.

## D2. D-180 batch cost-estimator drift — disclose, recalibrate, or drop
- Estimator vs actual diverges by **38% on one probe and ~30% on another**, with no
  disclosure anywhere in the UI. Writers plan spend against this number.
- Options: (a) recalibrate against `usage_records` and keep a point estimate;
  (b) show a range plus a "based on your last N runs" line; (c) remove the number and
  show only the cap the writer set. (b) is the honest-cheap option and matches how the
  rest of the money surface now reads after D-181.

## D3. Billed-but-discarded 409 race — who eats the cost
- A turn can be charged at the provider and then refused locally by the book cap
  (409), or aborted mid-turn under the all-or-nothing `req.signal` semantics landed in
  `eeb1fd8`. On camera (46-series abort shot) the writer's ledger was correctly left
  **virgin — 0 usage rows, thread untouched** — while the provider still charged
  **~$0.004**. The platform absorbs it silently today.
- Options: (a) absorb + disclose in aggregate ("provider spend not billed to you");
  (b) pre-reserve against the cap before the provider call, which makes the 409
  pre-flight and eliminates the race; (c) write a credit-ledger row.
- **Recommendation:** (b) for the cap race, (a) for the abort case. Note the semantic
  change already shipped: a mid-turn disconnect now loses the turn, unbilled and
  unpersisted — that is deliberate and should be named at the next re-judge.

## D4. D-155 managed no-key tier — **named the biggest grade-lifter twice**
- A cold free-tier writer has **zero working AI** without pasting their own key.
  This bounds P5 D6 and P1 D1 and was independently identified as the #2 lever on
  2026-07-06 and re-raised on 2026-07-26.
- Nothing in QA can move it: it is a unit-economics and abuse-surface decision
  (managed key, per-account budget, rate limit, fraud exposure).

## D5. Data + surface decisions declined by fix lanes, with recommendations
- **D-115 / D-190 orphan chapter content — migration.** `orphan-chapter-content.ts`
  now withholds orphaned content on GET and reclaims it on PUT, so the phantom-409 and
  the resurrection are both gone **without touching stored rows**. Pre-existing orphan
  rows still sit in the table, withheld. A cleanup migration is a data-deletion call.
  Recommendation: leave withheld (reversible), revisit if row count grows.
- **D-187 batch history has no surface.** The batch LIST route has zero UI consumers,
  so past runs and their spend are invisible. Product surface decision; the data and
  the honest derivation (`live-batch-view.ts`) already exist, so this is cheap.
- **D-192 chapter delete UI.** Lane C declined with a recommendation attached rather
  than inventing a destructive affordance.
- **D-184 WriterMemory near-duplicate curation.** The D-171 panel makes duplicates
  hand-prunable, which was the near-free half. Automatic semantic dedupe needs a
  similarity threshold and a merge-vs-supersede policy — a product call, because a
  wrong fold silently rewrites a writer's stated constraint.
- **Discuss has no free-tier meter or quota.** Quick-assist and ghost-text are metered
  in `free_tier_usage`; discuss turns are not, because there is no column for them.
  Adding one is a schema + pricing decision, not a bug fix.
- **Russian two-form plural** ("2 глав") still reads wrong after `plural.ts` shipped
  7 locales. Needs a native reader; scope call on how far i18n goes this campaign.

## How section D gates the board
Board at time of writing: P1 6.5 · P2 6.0 · P3 6.5 · P4 6.0 · P5 6.5 · P6 7.0 ·
P7 7.0 · P8 6.5. **D1 is the single highest-value ruling** — it is the named floor term
for the two highest personas and the reason P6's 7.0 did not go further. D4 bounds the
cold-start dimensions for every persona. D2/D3 are trust-surface honesty items that the
panels reward disproportionately. D5 is cheap-but-not-QA's-call.
