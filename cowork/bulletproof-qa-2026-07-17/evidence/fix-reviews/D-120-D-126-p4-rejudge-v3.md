# Defect register — D-120..D-126 (P4 re-judge v3, 2026-07-21)

Source: `judging/P4-REJUDGE-V3-AGGREGATE.md` (P4 = 6.0). Capture bundle
`evidence/p4-priya-rejudge-v3/`, HEAD `b8871ce`, workflow `wf_64037713-2be`.
Panel = 3 blind Fable lenses; every defect below is either capture-self-filed and
judge-confirmed, or judge-found and traceable to raw bundle evidence. Next free ID: **D-127**.

---

## D-120 · S4 · Batch LIST route serves stale raw row for live batch

`GET /api/books/:id/batch` returns the raw BatchRun row — observed `status:"queued",
spentUsd:0` on the list route while the detail route reported `running / $0.0446` for the
SAME batch mid-run (`poll-timelines/run1-summary.json` listRow). D-96's read-time live
derivation was applied only to the detail poll route; any list-consuming surface still shows
the exact "queued/$0" lie D-96 fixed. Fix direction: extract the live-view derivation from
`src/app/api/books/[id]/batch/[batchId]/route.ts` into a shared helper; apply per-row in the
list route for non-terminal batches. Terminal rows stay verbatim (digest source of truth).
Status: OPEN. Found: capture self-filed (TBD-2), confirmed UX judge.

## D-121 · S4 · EditFinding.originalText not byte-exact on hard-wrapped prose

Schema documents originalText as "exact text to find" for auto-apply, but 7/12 run1 anchors
normalize the fixture's hard-wrap newlines to spaces (`api-traces/d8-byteverify-run1.json`);
judges independently byte-verified: zero fabricated words, whitespace-only divergence (one
finding even carries byte-exact originalText beside a collapsed anchorQuote). Auto-apply
find-and-replace keyed on originalText can fail to locate spans in manuscripts pasted with
hard line breaks. Apply path NEVER exercised — silent-no-op vs tolerant-match unresolved
(top missing probe, all 3 judges). Fix direction: whitespace-tolerant span matching on apply
(normalize both sides) or persist byte-exact spans at extraction. Probe Apply first.
Status: OPEN. Found: capture self-filed (TBD-1), byte-verified by 2 judges.

## D-122 · S4 · Digest counts auto-rejected duplicate findings (7 credited vs 5 actionable)

run1 digest/notification/Findings-tab report "7 findings" but 2 rows (b8afbe67, 0411aa50) are
`status:"rejected"`, null originalText, byte-identical anchor+rationale to pending twins —
29% actionable-count inflation, visible as Findings-tab badge "7" vs sidebar Editorial badge
"5" in the same screenshot (screenshots/00,02-04). The dedupe gate persists rejected rows AND
counts them. Digest over-claim on exactly the trust axis P4 cares about (all 3 judges filed
this independently). Fix direction: exclude `rejected` status from digest findings.total,
notification count, and tab badge; or stop persisting gate-rejected rows.
Status: OPEN. Found: all 3 judges (capture missed it).

## D-123 · S3 · Halted-run digest credits 0 findings from 2 COMPLETED passes — unprobed

Halt batch: 2 completed + 1 skipped, digest `findings.total=0` while the same prose produced
3+3 findings in run1 (`poll-timelines/halt-summary.json`). Possibly true LLM-zero; possibly
completed-children-of-halted-batch findings are dropped/under-credited — the exact INVERSE of
the D-97 over-claim class. Capture never dumped persisted findings for the halt batch, so
undecided. Highest-severity open item from this panel (TRUST lens S3). Probe: rerun sub-cent
halt, dump `EditFinding WHERE sessionId IN (halt child ids)`, compare to digest total.
Status: OPEN (investigation first). Found: F+R judge (S4-unprobed) + TRUST judge (S3).

## D-124 · S4 · Mid-halt signals mixed for ~13s (halted:true / status:"running" / haltReason:null)

Polls #244–253: live Redis halt flag sets `halted:true` while `status` remains "running" and
`haltReason` stays null until digest fan-in (`poll-timelines/halt.jsonl`). A client keying on
status or haltReason sees a healthy running batch for ~13s after the halt decision; a live
viewer sees "halted" with no reason. Fix direction: when live halt flag is set, derive
status="halting" (or "halted") and surface a provisional haltReason in the same live view.
Status: OPEN. Found: F+R judge (S5) + UX judge (S4) — take S4.

## D-125 · S4 · UI budget-cap input min=$1 — sub-dollar caps unreachable from product

Batch dialog cap input has `min=1` USD; a cost-conscious BYOK writer cannot set a sub-dollar
cap through the UI at all (halt drill required API-set $0.005). Entire halt + NEW-2 rendering
path unreachable from the product for caps under $1. Fix direction: lower min to $0.01 (or
free-form with validation ≥ $0.01), keep NEW-2 sub-cent rendering.
Status: OPEN. Found: TRUST judge (capture noted in passing only).

## D-126 · S4 · Finding variance 7→2→0 on identical input — cross-run dedupe hypothesis untested

Three runs over byte-identical chapters yielded 7 → 2 → 0 findings. Capture attributed this
solely to LLM non-determinism, but run1 itself proves a dedupe gate exists (auto-rejected
duplicate rows, D-122) and monotonic decrease is the dedupe signature. If re-running a batch
on unchanged chapters silently near-zeroes findings, that is volume-writer-relevant behavior
(Priya re-runs line-edit nightly). Probe: check whether dedupe gate consults prior-session
findings for the same chapter; if yes, surface "N suppressed as duplicates of earlier
findings" in digest instead of silent zero. Overlaps D-123 (same silent-zero family).
Status: OPEN (investigation first). Found: TRUST judge.

---

## S5 / process notes (unregistered)

- Halt notification renders spent at 2dp beside cap at 3dp ("$0.05 / $0.005 cap") — actual
  spend $0.051775 is ~10.4x cap but the rounding obscures magnitude. Cosmetic; fold into any
  D-124/D-125 touch of `batch-digest.ts` formatting.
- Dashboard "Total Chapters 18" tile contradicts per-book chapter sum (23) on same screen;
  words tile reconciles exactly. Likely non-empty-chapter definition — flag + explain or fix.
- Process: capture's "0 foreign findings" acceptance check in `07-d97-provenance.ts` was
  tautological (query filtered to childIds, then asserted no non-childIds). The meaningful
  refutation (digest == own-session persisted count; run2 < run1) stands independently.
  Lesson for future capture prompts: acceptance checks must be falsifiable.
