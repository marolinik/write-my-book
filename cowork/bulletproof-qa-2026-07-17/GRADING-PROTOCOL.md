# GRADING PROTOCOL — Bulletproof QA wmb-pub 2026-07-17

## Rubric — 12 dimensions per persona

| # | Dimension | What it measures | Weight |
|---|---|---|---|
| D1 | Functionality | Persona's journeys complete correctly; all matrix rows in persona scope PASS | 2.0 |
| D2 | Reliability & data safety | **A writer's words are never lost**: autosave/409 conflict UI, offline buffer + reconnect sync, immersive-mode flush, crash/restart recovery, worker-down honesty (SSE error not silent hang), export never truncates; no uncaught console errors on happy paths | 2.0 |
| D3 | Usability | Nielsen heuristics: visibility of state (esp. long agent runs), user control (stop/cancel/undo), consistency, error prevention, plain-language errors, recognition-over-recall | 1.5 |
| D3b | Ergonomy & efficiency | Click-path economy (steps from open-app → typing; steps to run an edit pass vs theoretical min), keyboard-first writing (shortcuts, focus never stolen mid-typing, tab order), editor latency under load, no dead-ends | 1.0 |
| D4 | Onboarding / time-to-first-word | Fresh user reaches typing-in-Chapter-1 ≤ 60s from signup; write-first offers (2K/5K/10K) fire once, dismissible, never wall; BYOK setup path measured honestly as its own funnel step | 1.0 |
| D5 | Performance feel | Editor keystroke latency at 5K/50K/100K words; first-token latency + stream cadence on real model; autosave debounce feel; findings-panel load; export throughput; queue wait honesty (job position/progress visible) | 1.0 |
| D6 | Look & feel / design polish | Both themes flawless on every judged screen; AA contrast; empty/loading/error states designed; locale ×7 complete (no "2.026 words" leaks, no untranslated strings); typographic quality of the EDITOR itself (it's a writing product — the page is the product) | 1.0 |
| D7 | Trust & safety | Plan/tier gates enforced (prove by attempted bypass), ownership checks (cross-user book/finding/series access → 403/404), BYOK keys AES-encrypted + never in logs/Sentry/exports, prompt-injection via manuscript content contained, Stripe billing states correct, rate limits hold | 1.5 |
| D8 | Manuscript intelligence quality | The editorial moat, judged on REAL prose: line-edit preserves voice (no flattening), findings anchor verbatim + never misquote, continuity flags zero false positives, series sidebar states correct, discuss thread adapts to pushback, WriterMemory constraints actually honored next session, graph completeness honest (no false confidence from partial graph) | 2.0 |
| D9 | Retention / habit | Streaks + today-words REAL (computed, not hardcoded), daily plan useful, Story Health honest, radar non-fabricated, offer toasts anti-nag (fire once), return-visit has a reason | 1.0 |
| D10 | Delight | Moments that exceed expectation (continuity catch that feels like magic, series sidebar "it remembered Book 1", ghost text, overnight digest wake-up); "would recommend to a writer friend" | 0.5 |
| D11 | Competitive edge | Head-to-head vs the persona's incumbent (Sudowrite / NovelAI / Novelcrafter / ChatGPT+Projects / Scrivener+ProWritingAid / Google Docs): WIN/TIE/LOSE per task + "would switch & pay" verdict. See FLAGSHIP-ADDENDUM W1. | 1.5 |

**Persona grade** = Σ(dim × weight) / Σ(weights), 10-point scale.
**Hard floors:** no dimension < 8.5; **D1, D2, D7, D8 must be ≥ 9.0** regardless of average; D8 capped at 8.5 if ANY finding misquotes the manuscript or ANY continuity flag is a false positive (W2). Floor breach caps the persona grade at the floor value.
**Platform verdict** = min over the 8 personas. Target ≥ 9.5.

### The WRITER-TRUST VERDICT (gates platform sign-off, on top of all personas ≥ 9.5)
A 9.5 in a vacuum is not "the best AI writing companion." Sign-off additionally requires (FLAGSHIP-ADDENDUM):
1. **Zero words lost** in every W4 disaster scenario (crash mid-save, two-tab conflict, offline blip, immersive-mode kill, worker death mid-write-chapter, restore drill).
2. **Voice-integrity probe** (W2): line-edit on the pre-registered literary corpus judged blind — flattening rate within pre-set bound; protected signature devices survive ≥ pre-set floor; finding-misquote rate 0/N.
3. **Continuity net precision**: 0 false positives on the seeded-contradiction corpus AND ≥ pre-set recall on planted contradictions (a net that misses everything is theater).
4. **Money never overruns**: batch spend ≤ documented bound `cap + (concurrency−1)×perSessionCap`; single-session cap honored; Stripe states (checkout/upgrade/cancel/past-due) all land in the correct entitlement.
5. **Switch test** = "would switch & pay" for ≥ 6/8 personas; holdout blockers documented + triaged.
6. Golden-path regression suite green in CI (W12).
Short of any → honest plateau analysis + founder-decision list. A cited 9.2 that names its gap beats a fabricated 9.5.

## Non-functional coverage checklist (every persona journey MUST exercise + evidence)

- **Performance (D5):** keystroke-to-paint latency in editor at three manuscript sizes; first-token + inter-token cadence on real model (qwen3.6 labeled); autosave round-trip; findings load; export wall-clock; record numbers, not vibes; label everything "dev-server".
- **Look & feel (D6):** every judged screen screenshotted in BOTH themes; AA contrast on text; locale spot-checks in ≥2 non-English locales; empty + loading + error states all designed.
- **Ergonomy (D3b):** clicks/keystrokes counted vs minimum for: new book→typing, run line-edit, triage a finding, export docx; keyboard-only traversal of editor + findings panel; focus never stolen while typing (agent events, toasts, autosave must not move caret).
- **Usability (D3):** long agent runs show progress + are cancellable; every destructive action confirms; errors plain-language + recoverable; queue states honest when worker busy/down.
- **Accessibility:** editor operable by keyboard, focus visible, ARIA on findings/toolbar controls, reduced-motion, screen-reader labels on icon buttons (spot-check; full pass = W9).
- **Responsiveness:** phone + tablet breakpoints on editor, shelf, findings (Tier 2.4 shipped — verify, don't trust).
- **Resilience (D2):** network-kill mid-autosave, mid-stream, mid-export; two-tab same-chapter; worker killed mid-job; restart recovery.

## Calibration anchors (judges must internalize before scoring)

- **6** — works but feels like an internal tool; frequent friction.
- **7** — good SaaS baseline; occasional rough edge.
- **7.5–8** — the 2026-07-05 persona eval's **B−(80)** sits here: excellent craft for serious authors, real productization gaps (that eval PREDATES batch #4, immersive fix #1, voice gate #3 — verify those claims, don't inherit them).
- **8** — polished; a paying author is satisfied; rare friction.
- **9** — genuine peer to Sudowrite/Scrivener-grade polish with a real moat; friction is memorable because it's rare.
- **9.5** — best-in-class; testers actively try to lose words / break voice / leak keys and fail; writers would evangelize.
- **10** — reserved; do not award.

## Judge mechanics (hardened against self-deception)

1. **Panel:** ≥ 3 judges per persona, distinct lenses (functionality+reliability / UX+design+onboarding / trust+manuscript-intelligence). At least one judge on a different model family (not 3× same model — correlated blind spots), assigned an explicit disqualifier-hunting lens.
2. **Aggregation — MIN on floors, median elsewhere:** for D1/D2/D7/D8 and for misquote/false-positive/key-leak counts, dim score = **MIN across judges** (one judge catching a real fail must not be medianed away; a sub-floor score forces written reconciliation before it can be raised). Non-floor dims = median.
3. **Blind judging — actually blind:** judges get rubric + anchors + evidence bundle ONLY. No repo access, no TEST-PLAN, no memory files, no "≥9.5" anywhere in their context. For W1/W2 blind pairs, judges don't know which tool/which build produced which text.
4. **Evidence integrity — capture is OFF the executor:** journey executors do NOT assemble their own judge bundles. Capture is automated + exhaustive (Playwright auto-screenshot every step, full console+network logs wholesale, video/trace on judged flows). A separate adversarial agent re-captures the risky-row sample (data-loss / voice / billing / ownership / injection) from its OWN fresh persona user. No evidence for a claim → score as if false. Judge prompt includes: *"Does this bundle look suspiciously clean? What failure evidence would you expect that's missing?"*
5. **Planted-defect calibration:** before real grading, run the panel on a calibration bundle with 1–2 planted defects (a flattened line-edit; a finding that misquotes; a locale leak screenshot). Panel scores it ≥ 9 → panel is miscalibrated → its grades are VOID until fixed.
6. **Anti-inflation:** any dim ≥ 9.5 requires citing the 2 strongest evidence pieces + what's still missing for a 10. Two judges diverging > 1.5 → 4th tie-break judge.
7. **Re-grade scope:** any fix touching shared paths (prompt-assembler, autosave, orchestrator, queue) forces re-judge of D1+D2+D8 even if their evidence "didn't change" (behavior did), plus a golden-path re-run. Never fold a stale verdict into a new aggregate.
8. **Stale-worker rule (the #3 confound, institutionalized):** NO agent-output measurement is valid unless the evidence bundle includes proof that exactly ONE worker process was running (PowerShell process list by cmdline match) at capture time. A grade produced with unverified worker state is VOID.

## Metric pre-registration (no gate without N + threshold + protocol)
Commit these BEFORE running (report "0/50" not "0%"; label dev-server; label model qwen3.6 vs stronger):

| Metric | Sample N | Pass threshold | Construction | Run condition |
|---|---|---|---|---|
| Finding-misquote rate (W2) | ≥100 findings across ≥5 chapters | 0/N verbatim-anchor mismatches | pre-registered corpus, isolated persona user | real model |
| Voice-flattening (W2) | ≥30 line-edit hunks, blind pairwise vs original | flattening verdicts ≤ pre-set bound; protected devices survive ≥ 4/6 baseline, target 6/6 | the line-edit-quality-validation corpus + 1 fresh corpus | qwen + 1 stronger model, both reported |
| Continuity precision/recall (W2/W3) | ≥30 seeded contradictions + ≥30 clean chapters | FP = 0/N; recall ≥ pre-set floor (declare before run) | scripted seeds (dead-character/location/timeline) | graph populated, ONE worker |
| Autosave data-loss (W4) | ≥20 fault injections per scenario class | 0 lost words (diff-verified) | deterministic fault flags, not "sometimes" | — |
| Batch spend bound (W6/money) | ≥3 batches incl. 1 at-cap | spend ≤ cap + (concurrency−1)×perSessionCap; skipped children marked `skipped` | Redis ledger vs Stripe/provider actuals | ONE worker |
| Editor latency (D5) | ≥20 samples × 3 manuscript sizes | p50/p95 vs pre-stated budget | scripted typing burst | dev-server labeled |
| Recall/series correctness (W3) | ≥30 cross-book state queries | ≥ pre-set floor; book-2-aware answers cite book-1 state | seeded 2-book series | real embedder + graph |
| Export fidelity (P7) | every chapter, 3 formats | 0 content loss vs DB (normalized diff); titles/TOC correct | magic-byte + content diff | pandoc/typst |

**Model pin:** judges on the strongest available model (+ one cross-family). Executors may be cheaper; judges may not.

## Evidence bundle spec (per persona)

```
evidence/<persona-id>/
  journey-log.md          # step-by-step with timestamps + verdicts
  screenshots/            # every judged state, named <step>-<desc>.png, light+dark
  transcripts/            # agent/CAS/discuss transcripts (raw)
  api-traces/             # request/response samples for API rows
  manuscripts/            # before/after text for every edit pass (diffable)
  defects.md              # found during this persona's run, severity + repro
  worker-proof.txt        # process-list capture proving ONE worker during agent measurements
```

## Defect severity

- **S1** — writer data loss, billing overcharge/cap overrun, key/manuscript leak, ownership bypass, crash → blocks everything; fix immediately.
- **S2** — journey-blocking bug, wrong/fabricated editorial output, misquoted finding, continuity false positive → fix before re-grade.
- **S3** — friction/polish defect that caps a dimension < 9.5 → fix in priority order.
- **S4** — cosmetic; batch-fix.
