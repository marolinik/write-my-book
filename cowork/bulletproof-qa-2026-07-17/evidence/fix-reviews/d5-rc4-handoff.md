# W-D fix 5 — RC-4 silent-failure economics — HANDOFF FOR VERIFY

**Author:** opus-fix-d5 · **Branch:** qa/bulletproof-2026-07-17 · **Status:** COMMIT NOTHING (team-lead lands after verify)
**Closes:** P3 D7 = 3.0 "failure states LIE" crater — continuity extraction could die yet return a green 200, bill the tokens, tell the writer continuity was protected, and re-bill on every retry.
**Gate:** `tsc --noEmit` exit 0 · full `npx vitest run` = **872 passed / 118 files** · RC-4 targeted set **58/58** · pinned D-31 `graph-empty-extraction-poison` **12/12 green**.

---

## 1. Files (mine only — see §6 for what is NOT mine)

### Modified (5)
| File | Δ | What / root cause it closes |
|------|----|------|
| `src/lib/graph/entity-extractor.ts` | +31 | New `ExtractionOutcome` (`failed?`, `failureReason?`). The catch block used to swallow a throw into a **bare empty result** — indistinguishable from "model ran, found nothing." Now a thrown/timeout/parse error returns `{...empty, failed:true, failureReason}`. This is the honesty bit the whole fix rides on: **empty≠clean anymore.** |
| `src/lib/graph/graph-maintenance.ts` | +288 | The billing-honesty core (§2, §5). Billing cap, hard-failure fold, per-content-version marker, reset-on-success, low-yield advisory, read-only status facts. |
| `src/app/api/books/[id]/continuity/scan/route.ts` | +45 | Surfacing. Returns `{ flags, extraction }` where `extraction` is a derived `pending/extracting/failed/checked` view instead of an ambiguous `{flags:[]}`. On check failure returns `{flags:[], degraded:true, extraction}` — never a bare green. |
| `src/lib/agents/post-session.ts` | +25 | Post-session/agent path now captures the `UpdateFromChapterResult` and logs honestly (`capped` / `failed` vs `suspiciousEmpty` / `lowYield`) — no "graph updated" claim on a failure. |
| `tests/unit/continuity-scan-route.test.ts` | +56 | 13→16 tests; added `getChapterExtractionFacts` mock + `MAX_EMPTY_EXTRACTION_ATTEMPTS` to the graph-maintenance mock; new failed/pending/status-unavailable + throttle-indicator assertions. |

### Added (7)
| File | Tests | Purpose |
|------|------|---------|
| `src/lib/continuity/extraction-status.ts` | — | Pure derivation, **no Neo4j / no clock**. `deriveExtractionStatus(facts) → {state, capped, attempts, lowYield, throttled, retryEligibleAt}`. Precedence: justTriggered→`extracting`; attempts>0→`failed` (`capped` if ≥max); hasNode+contentHash→`checked`; else `pending`. |
| `src/app/api/books/[id]/continuity/route.ts` | — | Read-only **GET** (lists active flags; optional `?chapterNumber=` returns extraction status; never extracts, never bills) + **DELETE** (`?flagId=` transient dismiss via `deleteMany` fenced to book — distinct from POST/intentional permanent suppress). |
| `tests/unit/extraction-status.test.ts` | 12 | Pure `deriveExtractionStatus` truth table. |
| `tests/unit/entity-extractor-failure.test.ts` | 3 | `failed:true` on throw; `undefined` on genuine empty-but-ran. |
| `tests/unit/graph-extraction-economics.test.ts` | 7 | Stateful Neo4j mock wiring the counter read-back: cap after 5 (extractCalls length caps at 5 across 8 scans), content-edit resets, success clears counter, min-yield. |
| `tests/unit/continuity-list-route.test.ts` | 8 | GET/DELETE. |
| *(pinned, unchanged)* `tests/unit/graph-empty-extraction-poison.test.ts` | 12 | D-31 regression guard — still green (§4). |

Targeted total: 12+7+12+3+8+16 = **58**.

---

## 2. D-31 vs. what I added (per team-lead coordination note)

**Already owned by D-31 — I built ON, did NOT reimplement:** marker *existence* (`lastEmptyExtractionAt`/`emptyExtractionCount`), extract-first ordering, **no-delete on empty**, **no-hash-stamp on empty**, retry-on-next-scan, the `suspiciousEmpty` return bit, `SUSPICIOUS_EMPTY_MIN_WORDS`, `isSuspiciousEmptyExtraction`, `countWords`.

**Added by RC-4 (this fix):**
1. **Hard-failure honesty** — `ExtractionOutcome.failed`; `isFailedOrSuspicious()` folds a thrown LLM/parse error into the fail path. D-31 only caught *empty-on-substantive*; a genuine LLM **throw** still slipped through as clean-empty. (entity-extractor.ts + graph-maintenance.ts)
2. **Billing cap** — `MAX_EMPTY_EXTRACTION_ATTEMPTS = 5`. D-31's counter was `coalesce(count,0)+1` **with no reader** → unbounded re-bill (team-lead confirmed). `updateFromChapter` now reads the counter via `getEmptyExtractionState` and, if `priorAttempts >= MAX`, returns `{capped:true}` **before any `extractEntities` call** (no LLM, no tokens).
3. **Per-content-version scoping** of the marker — `markSuspiciousEmptyExtraction` upgraded from unconditional `+1` to `CASE WHEN lastEmptyHash = $emptyHash THEN +1 ELSE 1`, storing `lastEmptyHash`. Required so the cap window belongs to ONE content version — an actively-edited-and-retried chapter must not inherit a stale count.
4. **Reset-on-success** — `setContentHash` now also zeroes `emptyExtractionCount`/`lastEmptyHash`/`lastEmptyExtractionAt`. Idempotent recovery: a chapter that recovers starts a fresh cap window.
5. **Low-yield advisory** — `LOW_YIELD_MIN_WORDS=800`/`LOW_YIELD_MAX_ITEMS=1`; non-destructive `lowYield` flag for the *other* dishonest-green (a big chapter salvaged down to ~nothing — non-zero so not "suspicious empty", but implausibly sparse).
6. **Surfacing** — `getChapterExtractionFacts` + `extraction-status.ts` + scan route + GET route: the writer/agent can now SEE `pending/extracting/failed/checked/capped/lowYield`. D-31 wrote markers **nobody read**.

**Why the graph-maintenance diff is larger than "route-only":** the cap must skip the LLM call *before* billing, and `updateFromChapter` is the single choke point shared by BOTH the scan route and the post-session/agent-worker path. A route-only cap would leave the agent path uncapped. So the decision necessarily lives in `updateFromChapter`; the route only *surfaces*.

I **modified** two D-31 functions (`markSuspiciousEmptyExtraction`, `setContentHash`) rather than adding parallel ones — extension, not duplication. The pinned D-31 test proves the marker still never touches `contentHash` (§4).

---

## 3. Untouched / respected boundaries
- `src/lib/queue/agent-worker.ts` — **not edited.** It reaches extraction only via `processPostSession → updateChapterGraph → updateFromChapter`, so it inherits the cap for free (Z8 fail-safe billing intact).
- `src/lib/billing/**`, `src/lib/series/**` + series-context/ambient (d9 lane), ghost-text/inline-edit/agent routes — untouched.
- `graph-queries.ts` continuity CHECK Cypher (d2 lane) — untouched; I only surface around it.
- `sanitizeRelationshipType` / `escapeLabelForQuery` (D-63/D-30), `occursInChapter`/`userId` (6b5677f) — intact; all new params `$param`-bound.
- `types.ts` — deliberately left alone; `ExtractionOutcome` kept local to entity-extractor to avoid a story-time merge conflict.

---

## 4. The pinned D-31 test — why it is green now, why it was red mid-dev
`graph-empty-extraction-poison.test.ts:243` asserts, for **every** marker call, `expect(c.query).not.toMatch(/contentHash/)` — the marker must never write the Chapter's `contentHash` (that property's *absence* is what drives the retry; writing it is the D-31 poison regression).

My per-version marker first bound the failing hash as **`$contentHash`** — the param name contains the substring `contentHash`, so the marker query text matched `/contentHash/` and the assertion went **red**. Fixed by renaming the param to **`$emptyHash`** (stored on `c.lastEmptyHash`; semantics identical, still never writes `c.contentHash`). Now green. The `setContentHash` mock branch keys on `"c.contentHash = $hash"`, which my rewrite preserves verbatim, so success-path stamping still works. Verifier can confirm by reading `markSuspiciousEmptyExtraction` in graph-maintenance.ts (line ~382): the only hash param is `$emptyHash`.

---

## 5. Billing-honesty invariant (precise — attack this)

**On a hard failure or suspicious-empty (LLM ran, threw or gave nothing usable on substantive prose):**
- **Billed:** the writer's BYOK provider bills the ONE attempt that actually ran (unavoidable — the model executed). We do **not** add a second bill: no delete, no upsert, no hash stamp.
- **State:** `contentHash` NOT stamped, prior graph untouched, `emptyExtractionCount++` (scoped to this content hash), `lastEmptyExtractionAt` set, `updatedAt` bumped (feeds the 90s throttle).
- **Response:** `updateFromChapter → {updated:false, suspiciousEmpty:true, failed?, attempts}`. Scan route → `extraction.state = "failed"` (+`attempts`). **Never** `{updated:true}`, never a bare `{flags:[]}` green.

**On a capped skip (this content already failed 5×):**
- **Billed:** **nothing.** `updateFromChapter` returns `{capped:true}` *before* `extractEntities` is called. Zero tokens. Provably: the LLM call is syntactically after the cap's early return; the economics test asserts `extractCalls.length === 5` after 8 scans.
- **Response:** `extraction.state = "failed"`, `capped:true`. Recovery is a content edit (new hash ⇒ `lastEmptyHash` mismatch ⇒ counter resets to 1 ⇒ extraction re-enabled).

**On a genuine success:** hash stamped, markers reset, `{updated:true, lowYield?}`. A low-yield success is still `checked` but carries an honest `lowYield` advisory.

**Why silent success/degrade is now impossible:** the only path that returns `updated:true` / `state:"checked"` is the one that ran the model, got usable data, upserted, and stamped the hash. Every other path (throw, empty, capped, check-error) carries an explicit `failed`/`capped`/`degraded` marker that the scan route and GET route both render. There is no code path that both (a) fails/skips extraction and (b) reports clean.

---

## 6. NOT mine — present in the working tree (disclaim for the verifier)
These are **opus-fix-d-mig**'s W-D fix 2 lane, not part of my diff — do not attribute to RC-4:
`scripts/migrate-purge-contaminated-edges.ts`, `scripts/migrate-backfill-node-userid.ts`, `tests/unit/migrate-*.test.ts`, `evidence/edge-purge-census.md`, `evidence/node-userid-census.md`, `evidence/fix-reviews/dmig-*-verify.md`.

## 7. Deliberate follow-ups (NOT done — flagged, need a separate dispatch)
- **UI wiring** of the honest `extraction` state into `src/hooks/use-continuity-scan.ts` + `src/components/editor/continuity-indicator.tsx` — the D3/experience gap of "what the editor shows during the 90s-or-capped silence." Left as a dedicated UI dispatch to avoid lane conflict; the API now emits everything the UI needs.
- `types.ts` centralization of `ExtractionOutcome` — deferred to avoid a story-time merge conflict.
