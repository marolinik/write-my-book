# P4 Priya — Re-judge v3 AGGREGATE (2026-07-21)

**Verdict: P4 = 6.0** (was 4.0 — platform MIN). Blind 3-lens Fable panel over browser-rendered
re-capture on fixed HEAD `b8871ce` (batch-honesty fixes `adfa592` live-verified).
Workflow `wf_64037713-2be` (4 agents, 536k tokens, ~2h48m). Bundle:
`evidence/p4-priya-rejudge-v3/` (31 files, 1.2 MB — poll timelines, api-traces, screenshots,
scripts, journey-log). Supersedes `P4-REJUDGE-AGGREGATE.md` (07-20, 4.0).

## Headline

| Lens | Headline | Floor dims |
|---|---|---|
| FUNCTIONALITY + RELIABILITY | 6.0 | D8, D10 |
| UX / EXPERIENCE | 6.0 | D10 |
| TRUST + MANUSCRIPT INTELLIGENCE | 6.0 | D3b, D9, D10 |
| **AGGREGATE (MIN)** | **6.0** | **D10 (6.0 unanimous)**; D8/D3b/D9 6.0 |

## Per-dim (MIN over lenses)

| Dim | F+R | UX | TRUST | MIN |
|---|---|---|---|---|
| D1 | 7 | 7 | 7 | 7 |
| D2 | 7 | 7 | 6.5 | 6.5 |
| D3 | 6.5 | 7 | 7 | 6.5 |
| D3b | 6.5 | 6.5 | 6 | 6 |
| D4 | NO-EVIDENCE ×3 (fresh funnel out of scope, unchanged) | | | — |
| D5 | 6.5 | 7 | 7 | **6.5** (was 4.0 floor) |
| D6 | 6.5 | 7 | 7 | 6.5 |
| D7 | 7 | 7 | 7.5 | 7 |
| D8 | 6 | 6.5 | 6.5 | 6 |
| D9 | 7 | 6.5 | 6 | 6 |
| D10 | 6 | 6 | 6 | 6 |
| D11 | 6.5 | 6.5 | 7 | 6.5 |

## Baseline drivers — ALL CLOSED live (capture, browser-rendered, one-worker proof)

- **D-96 CLOSED.** Detail poll honest from poll#1 (status=running, counts.running=2, startedAt
  set ~2s in); live spend rose 0.0235→0.0446→0.0729 as children finished; halt flag visible
  13s before terminal; terminal detail==digest==list spentUsd $0.07291056 four-way agreement.
  Rendered in dashboard dialog (screenshots 02–04).
- **D-97 CLOSED.** Identical-input runs: run1=7 findings, run2=2 (FEWER — cumulative counter
  impossible), disjoint session ids, 0 foreign findings, digest total == own-session persisted
  count per run. 43-vs-11 superset symptom does not reproduce; source audit holds live.
- **D-98 CLOSED.** Sub-cent halt batch → title "Overnight batch halted — budget cap reached",
  haltReason budget_cap, priority high; healthy runs titled "complete". Rendered on /dashboard.
- **NEW-2 CLOSED.** Cap renders "$0.005 cap" not "$0.00 cap".
- **D-20 CLOSED.** Duplicate chapterNumber → 409 envelope, no 500, no silent auto-create; fresh
  number still 201.

## New defects (registered `fix-reviews/D-120-D-126-p4-rejudge-v3.md`)

| ID | Sev | Summary |
|---|---|---|
| D-120 | S4 | Batch LIST route serves raw stale row for live batch (queued/$0 while detail says running/$0.0446) — D-96's unpatched sibling endpoint |
| D-121 | S4 | EditFinding.originalText not byte-exact on hard-wrapped prose (7/12 anchors collapse newlines→spaces); auto-apply contract broken; Apply path unexercised |
| D-122 | S4 | Digest/notification/tab count includes auto-rejected duplicate findings — 7 credited vs 5 actionable (29% inflation); UI badge 7-vs-5 contradiction |
| D-123 | S3 | Halted-run digest credits 0 findings despite 2 completed passes — possible inverse-D-97 under-credit, UNPROBED (no persisted-findings dump for halt batch) |
| D-124 | S4 | Mid-halt signals mixed ~13s: halted:true while status stays "running" and haltReason null until fan-in |
| D-125 | S4 | UI budget-cap input min=$1 — sub-dollar caps unreachable from product; halt/NEW-2 path only reachable via API |
| D-126 | S4 | Finding variance 7→2→0 on identical input attributed to nondeterminism; cross-run dedupe hypothesis untested (monotonic decrease = dedupe signature) |

S5 notes (unregistered): halt notification renders spent 2dp vs cap 3dp ($0.05 / $0.005 — ratio
misreads); dashboard "Total Chapters 18" contradicts per-book sum 23 (words tile reconciles);
process note — capture's "0 foreign findings" check was tautological (filter guarantees pass),
though the meaningful refutation (digest==own-session count, run2<run1) stands.

## Evidence gaps bounding closure (all 3 judges concur; feeds Wave C/D)

Apply button never clicked (D-121 blast radius unresolved — top missing probe); halt-batch
persisted findings never dumped (D-123); no cancel-mid-run / worker-crash / Redis-outage /
concurrent-batch / failed-child drills; 3×~190-word fixture only — 30-chapter overnight scale
untested; browser under DEV_AUTH_BYPASS (authed rendering unproven); no continuity-workflow or
suggestedText voice evidence. "suspiciouslyClean: No" unanimous — bundle preserves 10x cap
overshoot, whitespace-broken anchors, list-vs-detail contradiction, dev overlay, 7→2→0 variance.

## Board impact

P4 4.0 → **6.0**. **Platform MIN moves to P5 4.5.** Board: P1 6.0 · P2 6.0 · P3 6.5 ·
P4 6.0 · **P5 4.5 (MIN)** · P6 6.0 · P7 7.0 · P8 6.5. Next MIN binder = P5 seeded-reasoning
defaults (D-116..D-119); then 6.0 trio evidence-gaps (Wave C).
