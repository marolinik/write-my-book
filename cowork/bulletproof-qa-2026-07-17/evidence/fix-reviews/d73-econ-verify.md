# verify-d73 — D-73 hardening (E4/E6/E7) — billing-honesty / economics lens

**Verdict:** APPROVE-WITH-NOTES (Fable, 2026-07-19)
**Gate:** `npx tsc --noEmit` exit **0** · `npx vitest run` **894 passed / 118 files** exit 0 · pinned D-31 `graph-empty-extraction-poison` **12/12** green · working tree matches handoff (8 D-73 files modified, uncommitted; HEAD eea71f6).
**Bottom line:** I could not break the core invariant. No path spends BYOK tokens and returns skip-shaped/clean; both caps are strictly pre-spend in both paths; the E6 catch is honest and bounded whenever the marker write can land; the counters are cleanly split with the injected clock; bible parity is real; lowYield never becomes a flag. The notes below are real but none is a spend-and-lie.

---

## 1. No spend-and-lie — PASS (every return enumerated, re-derived line numbers)

`updateFromChapter` (src/lib/graph/graph-maintenance.ts) — the ONLY spend site is `extractEntities` at :237. All returns:

| Return | Shape | Spend? | Verdict |
|---|---|---|---|
| :165 blank content | skip-shaped `{updated:false, entitiesFound:0}` | NO (pre-spend) | honest skip |
| :173 hash-match | skip-shaped | NO (pre-spend) | honest skip |
| :190-197 empty cap | `suspiciousEmpty+capped+attempts+failureKind:"empty"` | NO (pre-spend) | honest cap |
| :216-226 failed cap | `failed+capped+failureKind:"failed"+reason+retryEligibleAt` | NO (pre-spend) | honest cap |
| :252-260 `result.failed` | honest failed envelope + `markFailedExtraction` :251 | YES (attempted; provider errors bill ~0) | honest |
| :276-282 suspicious empty | honest envelope `failureKind:"empty"` + marker :275 | YES | honest |
| :313-317 success | `updated:true` — the ONLY updated:true site; reachable only after failed-check, empty-check, remove :287, upsert :295, stamp :302 all pass | YES | honest |
| :348-356 E6 catch | honest failed envelope, never skip-shaped | possibly YES | honest |

The two skip-shaped returns are both provably pre-spend. There is no path that reaches :237 and returns without `failed`/`suspiciousEmpty`/`updated:true`. entity-extractor.ts:307-330 converts EVERY in-try throw (LLM call, tool-block parse, text-fallback parse) to `{failed:true, failureReason}`; the only escaping throw is `createExtractionClient` at entity-extractor.ts:244 (no-key), which is PRE-spend and lands in the E6 catch → marked failed, bills 0. Honest-conservative.

## 2. Cap is pre-spend — PASS (both caps × both paths)

- Chapter: state read once :178 → empty cap :184-198 → failed cap :204-227 → spend :237. Both caps strictly before the LLM.
- Bible: state :393 → empty cap :395-402 → failed cap :403-413 → spend :417.
- Tests assert `extractCalls` (a real counter on the mocked spend site) equals the cap after cap+3 iterations for all six scenarios: chapter empty (economics :248), chapter failed (:277), chapter E6 (:367), bible empty (:397), bible failed (:404), bible E6 (:412). Assertions are for the right reason — they count invocations of the spend site, not envelope fields.
- **Prod-fidelity check I ran that the tests can't:** the driver is created WITHOUT `disableLosslessIntegers` (neo4j-client.ts), so counters come back as neo4j `Integer` objects while the tests mock plain numbers. If `Number(Integer)` were NaN the cap would be dead in production with green tests. Verified empirically against the installed driver: `Number(neo4j.int(5)) === 5` (coerces via `toString`) and `new Date(String(DateTime))` parses the 9-digit-nanosecond ISO form correctly. `num()`/`toDate()` in getExtractionState :653-661 are sound on real driver values. Cap fires in prod.

## 3. E6 post-spend infra throw — PASS, with the known residual (NOTE-1)

- Outer catch :318 covers remove/upsert/stamp. It writes `markFailedExtraction` :338 wrapped in its own try/catch :337-347, then returns the honest failed envelope :348-356. A fully-down Neo4j cannot throw past the honest return. Never skip-shaped.
- Bounded: with the marker write landing, a persistent post-spend outage costs exactly MAX_FAILED (5) spends, then pre-spend cap + one probe per 30 min. Test `a persistent post-spend infra outage is bounded by the failed cap` (economics :360-368) proves extractCalls === 5 under persistent `upsertThrows`.
- **NOTE-1 (MED, residual — the one the design cannot close inside Neo4j):** the bounded test models "upsert throws, marker write works". If Neo4j WRITES are fully down while READS still serve (double-fault: writes down + reads up + provider up), `markFailedExtraction` also throws → the counter cannot advance → next scan reads stale counters AND stale `updatedAt` (throttle bump is also a write) → `shouldExtract` true → re-bills. The in-code comment :340-341 and the handoff both claim "the honest envelope still prevents a re-bill loop" — **that claim is overstated**: the scan route drops the RESOLVED envelope entirely (`void updateFromChapter(...).catch(log)` scan/route.ts:81-90 — only rejections are logged) and post-session only console.warns it (post-session.ts:797-814). The envelope prevents a *reporting* lie, not a re-bill. Rate under this scenario: the UI scans on chapter switch + 20s activity debounce (use-continuity-scan.ts:57-68), so up to ~3 haiku-tier bills/min during active writing for as long as the triple condition holds. Truly bounding it needs a marker outside Neo4j (e.g. Postgres, which the route already has open) — out of D-73's scope. Minimum ask: fix the comment at graph-maintenance.ts:340-341 so it doesn't claim a bound that isn't there; register the Postgres-fallback marker as a follow-up.

## 4. Split-counter soundness — PASS

- Routing is exclusive and ordered: `result.failed === true` is checked FIRST (:243) — a failed outcome always has empty entity arrays, so checking empty first would have conflated them; it doesn't. Suspicious-empty (:267) only reachable when `failed !== true`. E6 catch → failed counter. No transient can touch the empty counter; no empty can touch the failed counter. Cypher matches: markSuspiciousEmpty is CASE-gated per content hash :558-561 (Cypher `null = x` → ELSE → reset-to-1 on first, correct); markFailed is unconditional `coalesce(...)+1` :594.
- Backoff uses the INJECTED `now` (param :162 with default; gate :207; derive uses `input.now` extraction-status.ts:194). The economics tests drive `h.clock` and pass `new Date(h.clock)` (:224-225, :304) — deterministic, not wall-clock.
- Editing prose does NOT lift a failed cap: the gate :204-207 has no hash term; test economics :285-296 asserts zero new spend after an in-window edit.
- Waiting does NOT lift an empty cap: the gate :184 has no time term; status test :99-106 asserts `retryEligibleAt` null on an empty cap (waiting would be a lie).
- Derive-layer precedence (both markers set → more recent wins, extraction-status.ts:153-161) tested both directions (:149-180), and `reason` only surfaces for the failed kind.
- Minor (NOTE-4): the E6 envelope reports `attempts: state.failedCount + 1` (:355) even when the marker write failed and the durable count did not advance — optimistic by one. Cosmetic.
- Minor (NOTE-5): a stale `failedCount ≥ 5` from an old outage (never reset because unchanged content hash-skips at :172 before any cap logic) makes the FIRST new failure after a later edit jump the count to 6 → instant 30-min cap instead of 5 fresh attempts. Direction is conservative — it under-retries and under-bills, and the envelope is honest (`capped`, `retryEligibleAt`). Cosmetic.

## 5. E7 bible parity — PASS (NOTE-3 on the void return)

- Both caps :392-413 pre-spend, both markers keyed on chapter 0 (:426, :438), E6 catch with best-effort marker :452-470, `setStoryBibleHash` resets BOTH counters :765-767 and keeps the `c.contentHash = $hash` substring the poison mock keys on. No residual uncapped re-bill: every bible spend path is now behind both caps (tests economics :394-428, incl. E6 parity).
- Chapter-0 collision impossible from routes: scan querySchema requires `.positive()` chapterNumber (scan/route.ts:26), so writer chapters can never read/write the bible's counters.
- **NOTE-3 (LOW):** `updateFromStoryBible` returns `void` on every path — success, capped, failed, and E6 all look identical to a caller. Safe today (callerless — confirmed: only export-site references), and the durable chapter-0 markers carry the honesty; but the first future caller inherits a silent-outcome API. Suggest returning the envelope (or documenting "read chapter-0 facts") when a caller is wired.

## 6. lowYield stays advisory — PASS

grep over `src/`: `lowYield` appears only in graph-maintenance (stamp :302/:515, envelope :316, facts :693/:730), post-session.ts:809 (console.warn only), and extraction-status.ts:213 (view field, only when state === "checked"). It never enters continuity-flags.ts nor any `db.continuityFlag` write — scan-route flags come exclusively from `toContinuityFlags(issues)` fed by `runConsistencyChecks` Cypher. Cannot become a graded flag; D8 8.0 not re-capped.

## Additional finding — NOTE-2 (LOW-MED, status honesty, not billing): capped chapter reports "extracting" on the POST path

scan/route.ts sets `justTriggered = true` (:91) whenever it fires the detached `updateFromChapter` — it cannot know the call will return capped with zero spend. Derive precedence 1 (extraction-status.ts:164) makes `justTriggered` win over the failure markers, so: a capped chapter, scanned >90s after its last marker bump (capped returns are pre-write, so `updatedAt` freezes), reports `state:"extracting"` — no extraction is running and none was started. The honest `failed/capped` view appears only on a follow-up POST inside the throttle window, or on the GET route (which hardcodes `justTriggered:false` :116 and is fully honest). Zero tokens involved — this is a state-honesty wobble inherited from RC-4's shape, slightly widened by the new failed-cap. Fix direction: have the POST consult the pre-read facts (it already fetches them at :105) to suppress `justTriggered` when the cap would gate, or fold into the flagged UI-wiring follow-up. Not blocking.

Also carried over unchanged from RC-4 (one line each): concurrent-scan TOCTOU can overshoot a cap by the burst width (both readers see count=4) — bounded by the 20s debounce/90s throttle, pre-existing, approved at RC-4; pre-spend read throws (getContentHash/getExtractionState, outside the try) propagate to the caller — scan route `.catch`es them (:88-90), post-session's caller logs — no spend, no lie.

## Verdict

**APPROVE-WITH-NOTES.** Core invariant unbroken under attack. Notes, in priority order:
1. **NOTE-1 (MED):** writes-down/reads-up double-fault leaves re-spend unbounded-in-count (rate-limited only by scan cadence ~3/min); the comment at graph-maintenance.ts:340-341 overclaims that the envelope prevents this — fix the comment now, register a Postgres-side marker fallback as follow-up.
2. **NOTE-2 (LOW-MED):** POST scan shows "extracting" for a capped chapter on first hit; GET is honest.
3. **NOTE-3 (LOW):** `updateFromStoryBible` void return hides outcomes from any future caller.
4. **NOTE-4/5 (cosmetic):** optimistic `attempts` in the E6 envelope when the marker write failed; stale failedCount insta-caps the first post-edit failure (conservative direction).
