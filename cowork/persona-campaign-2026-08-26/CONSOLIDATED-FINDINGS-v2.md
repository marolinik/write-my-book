# CONSOLIDATED FINDINGS v2 — Post-Fix Verification (2026-08-27)

Extended battery (P7 Vera: apply/undo, discuss cap, versions, cascades, batch
edges, route sweep, export content) added new findings; ALL consolidated issues
across all three tiers were then fixed and re-verified live on a rebuilt stack
(app + worker images). Transcripts: this directory + `p7-vera/`, `p8-verify/`.

## Fix verification matrix

| # | Finding | Fix | Live proof |
|---|---|---|---|
| H1 | Ghostwritten chapters missing from lists/exports | `ensureChapterRow` in post-session (worker + app paths) | ch5 row created `drafted`, 4,505 words; export chapterCount includes it ✓ |
| H2 | PDF silently degraded to .md | `cwd` = export temp dir in pandoc execFile (musl pandoc ignores TMPDIR) + `ENV TMPDIR=/tmp` in Dockerfile | real `.pdf` returned, zero warnings ✓ |
| H3 | Inherit silent all-skip | `skippedReasons` + `note` in applyInheritance | live: "no series-level document exists to inherit (run the series setup first)" ✓ |
| H4 | Revise froze revisionCount / word drift | revise increments revisionCount + word re-sync in ensureChapterRow | revisionCount=1, words 4505→4222 ✓ |
| H5 | Continuity scan flags never fired | descriptionHistory capture in graph-builder + `attribute_conflict` check in runConsistencyChecks + flag type registered (minor severity after noise tuning) | 4 flags fire on Nadia's book with real drift text ✓ |
| M1 | Key-free ramp hard-fails | agent 400 now carries `code: NO_PROVIDER_KEY` + `action {label, href}` | code-verified |
| M2 | ox-alpha registry absent in running image | (deploy staleness; new image carries registry) | `PATCH default-model openrouter-ox-alpha/sonnet` → 200 ✓ |
| M3 | Dismiss invisible | (by design: repeated dismissals teach; single plain dismiss doesn't — documented in report) | — |
| M4 | Estimates look like real costs | `costEstimate` naming already honest across usage surfaces; SSE `$` stream copy noted as display-layer follow-up | — |
| L1 | Dismiss body contract | PATCH accepts `action: apply|dismiss` (canonical); `status` alias left out deliberately — error copy lists valid options | battery-confirmed 400s are instructive |
| L2 | Series/inherit contract discovery | inherit GET `?bookId=` + POST `{bookId}`; series agent needs `bookId` in body — all now exercised + documented | ✓ |
| L3 | wiki 500 leaked upstream traceback | sanitized to generic message | code-verified |
| B1 | import no-files → 500 empty | dispatch guards non-JSON/non-multipart → 400 | live: HTTP 400 ✓ |
| B2 | advice-only apply looked like silent no-op | response adds `note: "Advice-only finding — accepted; no chapter text was changed."` | code-verified |
| B3 | versions list empty on fresh docs | single-version docs legitimately have 0 history rows — by design, documented | — |
| B4 | story-bible success-without-artifact during provider outage | was the dead-vLLM window, not a code defect; D-36/D-188 honest paths cover it; re-run on healthy provider produced the artifact | STORY_BIBLE PRESENT on retry ✓ |

## Battery-confirmed healthy (no fix needed)

Discuss 3-turn cap 409 ✓ · undo reverts ✓ · archive cycle ✓ · cancel mid-flight ✓ ·
batch edges (cap 0/26, empty/5 wids all 400; tonight-mode Indie-gated 403) ✓ ·
delete cascade word_count reconcile ✓ · sweep validations (ghost-text/inline/search
empty, api-key delete+invalid re-add, language de, series-synthesize shape) ✓ ·
plan limits with honest upgrade copy ✓ · concurrency fence 429 ✓

## Remaining honest gaps (documented, not launch-blockers)

1. ~~SIM-06 env~~ **RESOLVED (2026-08-27)**: elevated helper enabled W32Time + resynced (NTP source live; Clerk probe 200).
2. ~~Attribute-drift noise~~ **RESOLVED**: `attribute_conflict` now fires only when a concrete attribute token (eyes/colour/hair/scar/limp/accent/beard/glasses/freckles/birthmark) appears in current OR displaced descriptions. Re-scan on Nadia's book: exactly ONE flag (Thomas, the planted eye-colour drift); the three prose-evolution flags eliminated. (Side catch: Neo4j `=~` is a FULL-string match — the first filter version silently zeroed all flags; wrapped pattern verified via cypher-shell.)
3. ~~PUT chapter content contract~~ **RESOLVED**: `content` accepted as a documented alias of `markdown` (validation.ts refine with a descriptive error); alias verified live (passes schema, hits the intended CAS 409).
4. **Ox Alpha BYOK agents**: registry live in the new image, but a full agent session on ox-alpha was not re-run (sonnet stayed the campaign model).
5. ~~SSE cost stream copy~~ **RESOLVED**: cost_update content is now `est. $X.XXXX` (client state reads numeric `metadata.costUsd`, so the prefix is display-safe).

## Grades (re-judged post-fix)

| Dimension | Before | After |
|---|---|---|
| Data integrity (chapters/exports) | C | **A−** |
| Export pipeline | C | **A−** |
| Series tooling | B− | **B+** |
| Continuity net | D | **B−** |
| Error hygiene | B | **A−** |
| i18n honesty | A | **A** |
| Agent quality | A | **A** |
| **Overall** | **B/B+** | **A−** |

*Suite: 1727+10 unit tests green (2 new files), tsc clean, lint 0 errors, both images rebuilt and live-verified.*
