# Gate-2 (voice-flattening) — harness cannot run as written (2026-07-20)

Found while executing the BLOCKED-ENV voice run after env provisioning.

## Two blockers, one documented, one new

### 1. Corpus content deferred (documented)
`evidence-harness/corpora/README.md` line 36: **"corpus CONTENT is deferred."**
The `corpora/voice/` dir does not exist. The suite throws `[voice] corpus
missing (T11)` and run.mjs's seal-on-error path sealed a **vacuous PASS**
(rootHash `e3b0c442…` = SHA256 of empty string, 0 pairs). NOT a real gate pass.

Real prose available to assemble (5 chapters): `p6-owen/manuscripts/`
corpus-src-saltletters-ch3 / -ch5 (the line-edit-quality-validation corpus) +
owen-ch3-boathouse-ledger / owen-ch4-gull-road-adversarial /
owen-ch5-what-the-water-keeps (the fresh corpus carrying the registered
signature devices). `device-registry.md` = the registry (for judges, not
line-edited).

### 2. Harness reads before/after from the WRONG place (NEW — design gap)
`suites/voice-flattening.mjs:37-42` imports each chapter, POSTs a `line-edit`
agent call, then GETs chapter content and diffs `before` (imported) vs `after`
(post-line-edit) via `extractHunks`. But in this app **`line-edit` produces
FINDINGS, not a content rewrite**: `prompt-assembler.ts:1095` — line-edit
"Delegate to line-editor … Summarize prose findings"; only `dev-edit`/`revise`
call `WriteChapter` (prompt-assembler.ts:99,1113). So `after === before` →
`extractHunks` yields **0 hunks regardless of corpus**. The suite would seal
UNDER-N forever.

The correct before/after for a "does the line-editor flatten voice?" judgment
is each finding's `anchorQuote` (before) → `suggestedText`/`newText` (after) —
exactly the methodology `docs/mission/line-edit-quality-validation.md` used by
hand (Original → line-editor rewrite, judged against the fingerprint). The
harness must GET the chapter's `edit_findings` (or read the agent SSE findings)
and pair anchorQuote→suggested, instead of diffing chapter content.

## Why this is not the binding constraint on the re-judge
- Voice is ALREADY evidenced strong independent of this statistical harness:
  last blind judging scored **P6 voice-moat D8 = 8.0**, and the
  line-edit-quality-validation study graded the gated line-editor **B-** (gate
  converts wholesale flattening into surgical, fingerprint-aware editing).
- The binding floor in the last judging was **P3 series (3.0) + onboarding
  (4.0)** — PRODUCT quality the fix-wave targeted — NOT voice. The MIN-over-
  personas metric is capped by P3/onboarding, not by the voice gate.
- So the voice/continuity/misquote corpus-gate harnesses are belt-and-suspenders
  confirmation of dimensions that are either already-strong (voice) or already
  closed deterministically at the detection layer (continuity — Gate-3 corpus
  proved precision/recall behind its flag). They are a documented CEILING, not
  the score's binding constraint.

## Options (founder call)
- **A. Build all 3 corpus-gates before re-judge:** voice harness fix (read
  findings) + assemble voice corpus; continuity seeded/clean/nonchron corpora
  WITH founder-reviewed ground truth (README requires human review); misquote
  ≥5 chapters. Most complete; multi-hour; continuity needs founder review.
- **B. Fix + run voice only:** patch the suite to pair findings, assemble the 5
  real chapters (+author more if under N), run it; defer continuity/misquote as
  documented ceiling.
- **C. Run the re-judge now** on the landed fix-wave (measures the actual
  binding constraint — did P3/onboarding move), treat all 3 corpus-gates as
  documented ceiling + a follow-up track. Fastest path to the real number.

Recommendation: **C** (then B/A as a follow-up track). The re-judge measures the
crater personas the fix-wave targeted; the corpus-gates confirm non-binding
dimensions and shouldn't hold the score-measurement hostage.
