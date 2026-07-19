# D-73 hardening cluster (E6 / E4 / E7) — HANDOFF FOR VERIFY

**Author:** opus-fix-d5 · **Branch:** qa/bulletproof-2026-07-17 · **Base:** 909c6d9 (RC-4 landed)
**Status:** COMMIT NOTHING — team-lead lands after adversarial verify.
**Gate:** `tsc --noEmit` exit **0** · full `npx vitest run` = **894 passed / 118 files** · pinned D-31 `graph-empty-extraction-poison` **12/12 green** (unchanged).

Closes the three follow-ups both Fable verifiers left on the RC-4 land: E6 (post-spend infra re-bill window), E4 (empty-vs-transient counter conflation), E7 (story-bible cap parity). All three live in the RC-4 files.

---

## Files (8; +836/-206)
| File | Δ | Role |
|------|----|------|
| `src/lib/graph/graph-maintenance.ts` | +399/-206 | Core: split counters, backoff cap, E6 catch, bible parity. |
| `src/lib/continuity/extraction-status.ts` | +147 | `kind` + failed-counter facts + backoff-aware `retryEligibleAt`. |
| `src/app/api/books/[id]/continuity/scan/route.ts` | +4 | Pass new constants to `deriveExtractionStatus`. |
| `src/app/api/books/[id]/continuity/route.ts` | +4 | Same, GET path. |
| `tests/unit/graph-extraction-economics.test.ts` | +341/-… | Rewritten to the split contract + E6/E7 scenarios (stateful mock + clock). |
| `tests/unit/extraction-status.test.ts` | +109 | Failed-kind backoff + kind precedence (18 tests). |
| `tests/unit/continuity-scan-route.test.ts` | +30 | Failed-kind surfacing at the route (17 tests). |
| `tests/unit/continuity-list-route.test.ts` | +8 | Mock-fidelity (new constants + facts fields). |

---

## E6 — post-spend infra re-bill window (money-safety, do-first)

**The leak (verifier-confirmed):** `extractEntities` swallows LLM/parse errors into `{failed:true}` (never throws for those), so a throw reaching `updateFromChapter`'s outer `catch` is the POST-extraction writes — `removeChapterEntities` / `upsertEntities` / `setContentHash` — flaking AFTER tokens were billed. The pre-fix catch returned `{updated:false, entitiesFound:0}` — **byte-identical to an unchanged-skip** — with no marker, no cap bump. During a Neo4j write outage, every retry re-extracted and re-billed the writer's BYOK key with no ceiling.

**Fix** (`graph-maintenance.ts`, `updateFromChapter` catch): compute `reason` from the error, write `markFailedExtraction` (best-effort — wrapped in its own try/catch so a fully-down Neo4j can't mask the honest return), and return an **honest failed envelope** `{updated:false, failed:true, suspiciousEmpty:true, failureKind:"failed", attempts}`. Two consequences:
1. The route can never read it as clean/skip (it carries `failed:true` + `failureKind`).
2. The attempt counts toward the FAILED backoff cap → re-spend is **bounded to `MAX_FAILED_EXTRACTION_ATTEMPTS`** instead of unbounded.

Genuine success still clears the marker (`setContentHash` resets both counters). Bible path has the same E6 catch.

**Proof:** economics test `post-spend upsert throw marks FAILED and returns an honest envelope (never skip-shaped)` and `a persistent post-spend infra outage is bounded by the failed cap` — asserts `extractCalls === MAX_FAILED` after 8 scans with `upsertThrows=true`.

## E4 — split empty (content) vs failed (transient) counter

**The conflation:** RC-4 fed BOTH suspicious-empty AND `failed:true` into ONE content-edit-gated counter. So 5 provider 429/500s (which the writer didn't cause, and which bill ~0 tokens) paused a good chapter until a pointless prose edit — capping the cheapest failure class with the wrong recovery.

**Fix — two independent counters on the Chapter node:**
- **empty** (`emptyExtractionCount`/`lastEmptyHash`/`lastEmptyExtractionAt`, D-31): unparseable content. Cap `MAX_EMPTY_EXTRACTION_ATTEMPTS=5`, **content-edit-gated** (a new hash mismatches `lastEmptyHash` → resets). Recovery: edit.
- **failed** (`failedExtractionCount`/`lastFailedExtractionAt`/`lastFailureReason`, new): hard throw / infra flake. Cap `MAX_FAILED_EXTRACTION_ATTEMPTS=5`, **time-decaying backoff** `FAILED_BACKOFF_MS=30min`, NOT content-scoped. After the ceiling the auto-retry is withheld only until the window elapses, then one probe runs (self-heals when the provider returns). Recovery: wait / provider recovery — never a forced edit.

`markSuspiciousEmptyExtraction` (empty) vs new `markFailedExtraction` (failed) route on `result.failed === true` first, else `isSuspiciousEmptyExtraction`. `failureReason`/`failureKind` persisted (were previously only logged) and surfaced through `ChapterExtractionFacts` → `deriveExtractionStatus` → `ExtractionStatusView.kind`/`.reason`/`.retryEligibleAt`. When both markers are set, the derive layer surfaces the **more recent** one.

**Proof:** economics `caps hard failures after MAX_FAILED and exposes a backoff retry time`; `editing the prose does NOT lift a failed cap inside the backoff window`; `past the backoff window a probe runs again and a success self-heals`; `the two failure classes feed SEPARATE counters`. status: 6 failed-kind/backoff/precedence tests. route: `distinguishes a transient (provider) failure from an empty one, with a reason`.

## E7 — story-bible cap parity

`updateFromStoryBible` had the honest-failure guard but no cap/marker/throttle — a failing bible re-extracted (re-billed) on every save (safe only because it's currently callerless; team-lead's 909c6d9 guard comment flagged this). Since `getStoryBibleHash`/`setStoryBibleHash` already target `Chapter{bookId, chapterNumber:0}`, I mirrored the chapter path keyed on chapter 0: `getExtractionState(bookId,0)` + both caps + `markSuspiciousEmptyExtraction`/`markFailedExtraction` on 0 + E6 catch. `setStoryBibleHash` now resets both markers (parity with `setContentHash`, keeps the `c.contentHash = $hash` substring the poison mock keys on). The interim guard comment is replaced with a "BILLING CAP (D-73 E7)" doc.

**Proof:** economics E7 block — `caps suspicious-empty bible after MAX_EMPTY`, `caps hard-failure bible after MAX_FAILED`, `bounds a post-spend infra outage on the bible`, `a genuine bible success stamps + resets + skips a re-save`.

---

## Billing-honesty invariant (attack this)
- **empty failure:** billed the 1 attempt that ran; `state:"failed", kind:"empty"`; capped after 5 → LLM skipped (0 tokens) until a content edit.
- **failed (throw / post-spend infra):** billed the 1 attempt that ran (0 for a no-key/pre-spend throw); `state:"failed", kind:"failed", reason`; capped after 5 → LLM skipped until `retryEligibleAt` (lastFailedAt + 30min), then one self-healing probe.
- **capped (either):** `extractEntities` is never reached (early return) → 0 tokens. Economics asserts `extractCalls` never exceeds the cap.
- **success:** stamps hash, resets BOTH counters. Only this path returns `updated:true`.
- No code path both fails/skips extraction AND reports clean/skip-shaped.

## Pinned D-31 poison test — why still green
`markFailedExtraction` writes `lastFailedExtractionAt` (not `lastEmptyExtractionAt`), so it misses the poison test's marker-branch and its `not.toMatch(/contentHash/)` guard; the new state-read query misses all the poison mock's branches → falls to default `{records:[]}` → count 0, cap never fires in its ≤2-iteration scenarios; `setStoryBibleHash` keeps `c.contentHash = $hash`. 12/12 unchanged.

## Deliberately NOT done
- **No new retry endpoint.** E4 recovery is the time-decaying backoff (self-heals without user action); I did not add a manual "Retry check" endpoint (the other option team-lead offered) to avoid a new billed/authed surface. The API already emits `kind`/`reason`/`retryEligibleAt` if a UI later wants a manual button.
- **post-session.ts logging** not enriched with `failureKind` (envelope carries it; the existing `failed`/`capped`/`suspiciousEmpty` log is still honest).
- **UI wiring** (`use-continuity-scan.ts` / `continuity-indicator.tsx`) still the separate dispatch flagged on the RC-4 handoff — now with `kind`/`reason`/`retryEligibleAt` available to render.
