# GRADE-LIFT PLAN — impact-ranked, MIN-first
2026-07-20 · synthesized (Fable team-lead) from grade-lift mining workflow wf_2237fd4a-92b
(9 opus miners over all judge verdicts + defect register; 935k tokens; judges' own words cited in miner output `tasks/wkgsrtspp.output`).

## Board of record (correction included)

| Persona | Grade | Floor dim(s) | Floor bound by |
|---|---|---|---|
| **P4 Priya** | **4.0** (fresh 3-panel 2026-07-20, `judging/P4-REJUDGE-AGGREGATE.md` — supersedes the ~5.5 v2-delta estimate) | D5 4.0; D3/D8/D10 5.0 | **D-96** (live poll lies), D-97, D-98, EVIDENCE (API-only, counts-only findings) |
| **P5 Sam** | 3.5 pre-fix cert; **v3 re-judge in flight** (wjdrigcy6), projected ~5–6 | D2/D7 (pre-fix) | D-92/D-95/D-99/D-100 all fixed/resolved; post-fix binder projected D11 ~4.5 (positioning) |
| P1 Maya | 6.0 | D3b | D-104+D-107 (FIXED, not re-judged) + UI evidence gap |
| P2 Gerald | 6.0 | D4, D8, D10, D11 | Mostly evidence-gap (fresh funnel, delight/competitive artifacts dropped from API-only re-capture) + D-115 |
| P6 Owen | 6.0 | D4 | Pure evidence-gap (wizard fixed, no UI capture); next cluster D7 6.5 = D-49, D-42, D-108 |
| P3 Selena | 6.5 | D3/D3b/D5/D8/D9/D10/D11 (7-dim cluster) | API-only capture + D-90, D-91, OBS-1 |
| P8 Rita | 6.5 | D5 | Pure evidence-gap (fence-sweep bundle, zero perf-feel) |
| P7 Bao | 7.0 | D3, D10 | Evidence-gap + D-57, D-46, D-111 |

**Platform MIN = P4 4.0.** MIN ladder: 4.0 (P4) → P5 v3 result → 6.0 trio (P1/P2/P6) → 6.5 (P3/P8) → 7.0 (P7).

**Systemic finding (unanimous across miners):** above P4/P5, nearly every floor is an
EVIDENCE-GAP, not open code — API-only bundles left D3b/D4/D6 blind and judges refuse
credit for unrendered UI. One coordinated browser-driven capture wave is the dominant
platform lever. Floors = live-moment honesty/observability gaps (D-96 continues the
D-17/D-96/D-98 "surfaces lie mid-run" family), confirming the campaign's core pattern.

## Wave A — P4 floor = platform MIN binder (NOW)

1. **D-96 code-fix (S2, THE grade mover).** Across ~110 polls: `counts.running` always 0
   (worker never writes status=running), batch `status:"queued"` + `halted:false` while
   children terminal, `spentUsd:$0.00` after real spend, `startedAt:null`.
   Fix: (a) worker `src/lib/queue/agent-worker.ts` sets AgentSession.status='running' at
   processAgentJob start (after skip-guard) for batch children; (b) poll route
   `src/app/api/books/[id]/batch/[batchId]/route.ts` derives the live view at read time
   from child rows + ledger (live spentUsd = Σ child.actualCostUsd; live status; startedAt),
   terminal digest stays source of truth. TDD RED-first.
   Expected: D5 4.0 → ~7.0 (judge-stated), + D3, + D11.
2. **D-97 confirm-then-fix.** Digest credits 2 findings to a SKIPPED child; counts strictly
   superset prior run (43 vs 11 on identical input) — hypothesis: `aggregateBatchDigest`
   counts persisted findings by chapter RANGE, re-selling prior nights' work. READ SOURCE
   FIRST; if range-based, scope to this batch's AgentSession ids. RED test: re-run on
   identical input must not superset; skipped child contributes 0. Expected D8 5.0 → ~6.
3. **D-98 + NEW-2.** Halted batch notification titled "Overnight batch complete";
   sub-cent cap renders "$0.00 cap" (toFixed(2)). Fix in `batch-digest.ts` (~L180-203).
   Expected D10 5.0 → ~5.5-6.
4. **P4 v2 re-capture + fresh 3-panel** (after 1-3 land): browser-driven, must include
   mid-run poll RENDERED in dashboard (running>0, live spend, pins D-96 severity),
   morning-digest notification as rendered, ISOLATED worker (valid latency), finding
   CONTENT + anchors (D8 byte-verify), D-20 fix spot-check (409).
   Expected: **P4 4.0 → ~6.0-6.5** = platform MIN lift of ~2-2.5 points.

Register bookkeeping: assign IDs to P4 panel-surfaced NEW-B (cap-overshoot bound
misdocumented) and J-4 (no child retry policy) at next register update (next free D-116).

## Wave B — P5 v3 (in flight, wjdrigcy6)

Wait for verdict; capture already runs on fixed HEAD (D-100/D-92b/D-95/D-99 banked).
Post-fix residuals ready to fire if v3 confirms them binding: D11 positioning (seeded
default model returns 422 "choose a different model" — default to non-reasoning model
for quick-assist tier, quality); D-15/D-14 error hygiene; D-93/D-94 a11y; fake habit
furniture (AuthorshipTracker "100% human").

## Wave C — browser-capture wave (lifts P1, P2, P6, P3, P8, P7 simultaneously)

One browser-driven capture per persona on current fixed HEAD, then blind Fable re-panels:
- **P1**: discuss + findings-list UI (banks D-104/D-107/D-113) + fresh-funnel D4/D6 (latent floor risk). D3b 6.0 → ~7-7.5 ⇒ P1 → ~6.5.
- **P2**: fresh-user funnel + conflict-dialog/version-history/"Load theirs" + restore drill + competitive teardown re-supplied + real manuscript-intelligence pass (D8 n=1 now) + ghost-text first-taste on fixed D-100. Lifts all 4 floors ⇒ P2 → ~6.5-7.
- **P6**: wizard → first-word onboarding UI (banks D-43 on D7 too). D4 6.0 → ~7-7.5 ⇒ P6 → 6.5.
- **P3**: flag list, jump-nav, series-context "Dorn" moment in UI, both themes. Unblocks 4-5 of 7 floor dims ⇒ P3 → ~7.
- **P8**: real writing-session perf-feel (stream latency/cadence) + fresh funnel + retention. D5 6.5 → ~7.5 ⇒ P8 → ~7.5 (then plateau at D1/D2/D3 7.5 band).
- **P7**: editor autosave/409-conflict UX + keystroke latency at 5K/50K/100K + export flow. Lifts both floors ⇒ P7 → ~7.5.

## Wave D — targeted code-fixes feeding Wave C re-panels

| Defect | Persona/dim | Fix direction | Class |
|---|---|---|---|
| **D-115/D-22** | P2 D1/D2/D10 | Key CHAPTER_CONTENT by chapterId or cascade-purge on chapter delete (root: DocumentService.findByType resolves by chapterNumber) | S3 code |
| **D-42** | P6 D7/D1 | GET session-status endpoint (SSE recovery path) | S3 code |
| **D-49** | P6 D7 | Ground rationale quotes = verbatim substrings of fingerprint doc | quality |
| **D-91** | P3 D3/D3b | relationship_contradiction gets chapterNumber/jumpChapter/anchor like sibling classes | S3 code |
| **D-90** | P3 D8/D2 | Explicit-death predicate before status=dead + death Event; low-confidence bar from dead_character_reappears. STOP if suppresses genuine deaths | quality |
| **D-57** | P7 D3 | 9 book-scoped routes → "Book not found" envelope | S4 code |
| **D-46** | P7 D3/D10 | Transliterate Æ/Ø/ß/ł before NFD fold in export-pipeline.ts | S3 code |

## Wave E — design lane (needed for 7.0+, after floors move)

- **D-109** streaming/async discuss (kills 157s dead spinner; P6 D5, P1 D5, P4 sibling).
- **P2 stampless first-save** CAS-protect first head-write (last-write-wins window).
- **P3 flag lifecycle** + OBS-1 silent-vanish fix (D9).
- **D-106** BLOCKED — founder call on FindingReply.structured column.
- **Z8** batch ledger idempotency key (crash-restart re-spend); P4 D2 hardening.
- **D-101** DEV_AUTH_BYPASS prod startup assertion + real Clerk-boundary negative controls (P8/P5 D7 ceiling).

## Parked / ceiling-only (no grade impact until floors clear 7.5)

D-108 fingerprint regen, D-114 aphorism false-positive (D8 cap), D-93/D-94 a11y,
D-111 XMP title, D-85 canon word-order, D-102 overlapping spans, D-103 semantic dedup,
NEW-B doc bound, J-4 retry policy, P7 kill-mid-save + markdown-export drills,
P3 tenancy probe (D7 already 8.0), P8 prod-auth ceiling (D7 8.0).

## Sequence

1. **Wave A lanes 1-3 now** (worktree-isolated — dev server + worker must stay
   undisturbed while P5 v3 capture is live; land via stash-RED pipeline after capture ends).
2. P5 v3 verdict lands → board update; fire Wave B residuals if binding.
3. Wave D fixes (parallel lanes) + Wave A item 4 (P4 re-capture).
4. Wave C browser-capture wave + re-panels (the big board mover: projected board after
   A+C+D ≈ P1 6.5 · P2 6.5-7 · P3 7 · P4 6-6.5 · P5 5.5-6 · P6 6.5 · P7 7.5 · P8 7.5).
5. Wave E design lane toward 7.0+, then ceiling work.
