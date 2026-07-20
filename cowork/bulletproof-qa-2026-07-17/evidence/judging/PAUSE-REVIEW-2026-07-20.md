# W-G Re-judge — PAUSE-FOR-REVIEW checkpoint (2026-07-20)

Founder ruled "prove the lift, then pause." The 3 MIN-candidate personas (P3/P4/P5) have
been fresh-re-captured, their floor-drivers fixed+verified+committed, and P4/P5 re-captured
a second time (v2) to CONFIRM the fixes lifted the floor live. This is the pause point.

## Re-judge board (MIN-candidates)

| Persona | Baseline (07-19) | v1 rejudge | v2 (post-fix confirm) | Movement |
|---|---|---|---|---|
| P3 Selena (series moat) | 3.0 **(old platform MIN)** | **6.5** (blind 3-panel, unanimous) | — (no v2 needed) | **+3.5** |
| P4 Priya (overnight/batch) | 4.0 | 4.0 (D-17 closed, D-96 relocated floor) | **~5.5** (all fixes confirmed live) | **+1.5** |
| P5 Sam (card-free on-ramp) | 4.0 | 3.5 (new S2s surfaced) | **~4.5–5.0** (trust lifted; D-100 new floor) | **+0.5–1.0** |

**The 3.0 platform floor is gone.** New MIN among re-judged personas ≈ **4.5–5.0** (P5),
bounded by D-100 (a newly-surfaced, fixable AI-first-taste defect).

### Method note (honesty)
- P3 = full blind 3-Fable-panel (func/exp/trust), MIN-on-floors, unanimous 6.5. Certified.
- P4/P5 v1 = full blind 3-panels (3.5–5.0 spread; MIN-on-floors gave 4.0 / 3.5).
- P4/P5 **v2 numbers (~5.5 / ~4.5–5.0) are a team-lead rule-7 DELTA re-aggregation**, not a
  fresh 3-panel: the v2 captures CONFIRMED (live, independently, one-worker-proof) the
  specific fixed dims, and I lifted only those dims over the v1 panel scores, carrying the
  rest forward. A fresh v2 3-panel can be run to certify the exact numbers if you want them
  hardened; the DIRECTION (lifted, and by roughly how much) is solid.

## What the v2 captures PROVED live

**P4-v2 — all 3 fixes confirmed, no new defects (`evidence/p4-priya-rejudge-v2/`):**
- D-96 live poll now honest: a genuinely non-terminal poll (`digest=null`) shows
  `status:"running"`, `spentUsd:0.033`, `startedAt` set, `running:2/completed:1` (was
  queued/0/$0/null). → D5 (queue-honesty) lifts 4.0 → ~7.
- Terminal four-way spend agreement NOT regressed: $0.148133655 across all surfaces.
- D-98 halted notification honest ("halted — budget cap reached", cap renders $0.002).
- D-20 chapter collision → 409 (was raw 500). → D1/D3 lift (raw-500 ding removed).
- **P4 new floor** ≈ D3b/D8 (~5.0–5.5): finding-content evidence gap + click-path — not
  trust/data defects.

**P5-v2 — trust floor lifted; a new AI-taste floor surfaced (`evidence/p5-sam-rejudge-v2/`):**
- D-95 false-privacy copy fixed+live; Free-cap 2nd-book→403 DRIVEN (v1's untested-cap gap
  closed); export ungated→200 real .docx; billing 401-mask fixed → honest 500 → **200
  post-server-restart** (re-verified live). → D2/D7 lift 3.5 → ~6.5.
- **P5 new floor** ≈ D11 (~4.5–5.0): the AI-moat first taste is STILL broken — see D-100.

## New defects surfaced by the re-judge (status)

| ID | Sev | Persona | Status |
|---|---|---|---|
| D-90 | MED | P3 | OPEN — extraction over-inference writes a hallucinated death (latent-FP). Follow-up. |
| D-91 | LOW-MED | P3 | OPEN — relationship_contradiction ships chapterNumber:0/null-anchor. Follow-up. |
| D-96 | S3(→S2) | P4 | **FIXED + confirmed live** — batch live-surface lies. |
| D-97 | — | P4 | NOT-A-BUG (investigated) — findings scoped to this run; recommend a label clarification only. |
| D-98 | S3 | P4 | **FIXED + confirmed live** — halted batch mislabeled "complete". |
| D-99 | env | P5 | **RESOLVED** — stale globalThis Prisma client; server restarted, billing→200 verified. |
| D-100 | **S2** | P5 | **OPEN — the new binding floor.** Reasoning-model default (qwen3.6-27b) returns only thinking blocks at ghost-text budgets → 502, never a usable suggestion. AI first-taste broken. |
| D-101 | dev-only | P5 | OPEN (low) — DEV_AUTH_BYPASS masks the no-auth 401 control; latent S1 if it reaches prod. |
| D-20 | S2 | P4/P3/P2 | **FIXED + confirmed live** (P2002→409). |
| D-92 | S2 | P5 | **FIXED** (401-mask code + db:push + server restart). |
| D-95 | S2 | P5 | **FIXED + confirmed live** (privacy copy). |
| D-93/D-94 | S3 | P5 | OPEN (minor a11y — contrast, landmark-unique, html-lang). |

## The systemic finding (the strategic headline)
Every fresh adversarial capture **relocated the floor to a previously-unprobed live-state
honesty / observability gap**, not to a lack of features:
- P3: terminal graph correct, but a hallucinated death sits latent in canon (D-90).
- P4: terminal money truth byte-exact, but the LIVE surface lied ($0/queued/not-halted) — D-96.
- P5: on-ramp real, but shipped a false privacy claim (D-95) + masked a 500 as 401 (D-92) +
  a reasoning-model default that can't produce a suggestion (D-100).
The product's pattern is **"tells the truth at rest, but lies or breaks in the live moment."**
This is why 9.5-MIN is multi-cycle: each fix reveals the next instance. The fixes ARE landing
(P3 +3.5, P4 +1.5, P5 +1) — but a broad band of these gaps remains.

## Open decisions for you
1. **D-100 (P5's binding floor):** how to fix the reasoning-model AI-first-taste — disable
   thinking for ghost-text/inline, switch the free on-ramp's quick-assist default to a
   non-reasoning model, or parse-and-retry. (Register: `fix-reviews/D-99-D-100-D-101-p5v2.md`.)
2. **Held personas P6 Owen / P8 Rita / P1 Maya / P7 Bao** (baseline 5.0–5.5) — not yet
   re-judged. Per the pattern they will likely surface their own new floors. Re-judge now, or
   hold until the P3/P5 follow-ups (D-90/91/100) land?
3. **Certify v2 numbers?** run fresh v2 3-panels on P4/P5 to harden ~5.5 / ~4.5–5.0, or accept
   the delta re-aggregation for now.
4. **P3 follow-ups D-90/D-91** — fix now or defer (non-binding on P3=6.5).
5. **The multi-cycle reality** — keep grinding to lift the MIN, pivot to a systemic
   live-state-honesty layer, or accept the current ~4.5–6.5 band and produce a launch-scope
   punch-list. (This was the earlier A/B/C/D fork; the data now strongly supports either the
   systemic pivot or the punch-list.)

## Env state at pause
- Branch `qa/bulletproof-2026-07-17`; all fixes committed+pushed (2607267 / 472c3a9 / a636774
  / adfa592 + this checkpoint's evidence commit).
- Dev server + worker BOTH restarted on current code + Prisma client; `free_tier_usage` synced.
  Billing/free-tier path live-verified.
- Next free defect ID: **D-102**.
