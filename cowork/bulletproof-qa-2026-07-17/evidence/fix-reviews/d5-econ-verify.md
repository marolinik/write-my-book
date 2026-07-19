# verify-d5-econ — RC-4 silent-failure economics (billing-honesty lens)

**Verdict:** APPROVE-WITH-NOTES (Fable, 2026-07-19)
**Gate:** tsc --noEmit exit 0; vitest **872/872** (118 files) all green incl. the 3 named RC-4 test files.
**Bottom line:** the core lie is dead — no path both spends BYOK tokens AND reports continuity "checked" when extraction failed/empty. Not REJECT-worthy.

## Checks
- **E1 failure≠success — PASS.** Every updateFromChapter return enumerated (graph-maintenance.ts): blank :146 / hash-skip :154 / capped :171-177 / failed-suspicious :207-213 (returns BEFORE removeChapterEntities :218, upsertEntities :226, setContentHash :233; only write is markSuspiciousEmptyExtraction :206, which SETs $emptyHash→lastEmptyHash, never contentHash). The ONLY `updated:true` site :244-248 is reachable only when isFailedOrSuspicious false. updateFromStoryBible has the same honest-failure guard :290-299.
- **E2 capped=zero bill — PASS.** getEmptyExtractionState :163 → cap return :165-178 precedes the sole spend site extractEntities :188 (→ client.messages.create entity-extractor.ts:252). Economics test extractCalls===5 after 8 scans matches real control flow.
- **E3 no permanent lockout — PASS.** 1-char edit → new sha256 → priorAttempts=0; success → setContentHash resets emptyExtractionCount=0/lastEmptyHash=null :360-361; counter per-content-version via CASE WHEN :402-405.
- **E5 lowYield FP — PASS.** 850w stream-of-consciousness → lowYield, but non-destructive + non-rebilling (stamps hash) and ADVISORY ONLY: grep confirms lowYield never enters continuity-flags.ts or any ContinuityFlag write → cannot become a graded flag → D8 8.0 not re-capped. (Adjacent: a genuine 0-entity 800w chapter hits suspicious-empty → 5 cheap capped attempts, honest.)
- **E6 billing-as-success impossible — PASS + residual (see D-73).**

## Follow-ups → registered as D-73 (non-blocking; crater lands first)
- **E4 (MED):** cap conflates content-empty with transient throw (429/500/rotated-key all → failed:true → same counter :206). 5 transient outages pause a good chapter until edit. Honest (failed+capped surfaced, retryEligibleAt nulled) so not a re-lie; but the cheapest failure class gets capped. failureReason logged :203 but not persisted → UI can't say "provider down" vs "extracts to nothing". Fix: split the counter (content-edit-gated cap for suspicious-empty; time-decay/consented-retry for failed:true); persist failure kind.
- **E6 (LOW-MED):** post-spend infra-throw window — extraction spends, removeChapterEntities succeeds, upsertEntities throws → prior contribution deleted, no write, no marker, no cap bump, envelope == unchanged-skip → unbounded re-spend while Neo4j reads+provider work. Narrower than pre-fix, self-heals. Fix: wrap remove+upsert+stamp so a post-spend infra throw still writes the failure marker (counts attempt, bumps throttle).
- **E7 (LOW):** updateFromStoryBible has no billing cap (no getEmptyExtractionState before extractEntities :284). Mitigated by unchanged-content hash skip :278 (only re-bills when bible changes) — lower exposure than the scan-button chapter path. Fix: mirror the cap keyed on chapter 0.

## Landing
RC-4 crater fix is landable on the core invariant once verify-d5-route (security/route/rename/no-regression lens) also clears. D-73 = fast subsequent hardening pass by d5, does not gate the crater.
