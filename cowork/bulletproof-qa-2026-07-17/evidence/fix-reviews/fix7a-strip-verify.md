# fix 7a — canonical-poison blocker fix: focused Fable re-verify (verify-fix7a-strip)

**Verdict: APPROVE — blocker fully closed. Blocking: NO.** (verify-fix7a-strip, Fable)

1. **Poison closure — confirmed, both paths.** `delete allProps.canonicalName;` (graph-builder.ts:250) sits in the same strip block as bookId/userId/status/role/description/chapter/occursInChapter/deathChapter/aliases, before `createProps = { ...allProps }` (:311), so neither `$updateProps` (allProps, :452) nor `$createProps` can carry an LLM value. Exhaustive grep: the only `canonicalName` writes in all of `src` are the app-derived `createProps.canonicalName = canonicalName` (:371), the coalesce param (:465), and the lookup param (:198) — every one fed exclusively by `canonicalizeEntityName(name)`. No residual path.

2. **Pessimistic mock — genuine.** The fake session applies `merged = { ...existing, ...updateProps }` FIRST, then the coalesce reads `merged.canonicalName` (the post-`+=` value), falling back to the param only when nullish (test :111-127) — the dangerous sequential ordering, not a snapshot. RED check on a copy (backed up, strip line removed, single-file run): 26 tests, 2 FAILED for exactly the right reasons — a12: `updateProps.canonicalName` was "Wedding" (poison reached $updateProps); a13: stored key repointed, `expected 'Wedding' to be 'Funeral'` (coalesce read back the frozen poison). RESTORED byte-identical: SHA256 identical before/after (E19FADBE…C7F0); git status/diff unchanged from executor's state.

3. **Gates + no drift — actual.** `npx tsc --noEmit` exit 0; `npx vitest run` 964 passed / 125 files / 0 failed (pre-strip baseline 961/125 + exactly the 3 new tests; new file 23→26). Source delta vs the panel-approved version is exactly the one delete line + its comment; fold logic, Event-scope gate, raw `{bookId, name: mergeName}` MERGE, RC-2/D-27/RC-6/D-30/D-63, and sub-fix (b) sticky-dead/authoritative all match what the approving lenses verified.

**Residuals (pre-existing, non-blocking):** relationship-endpoint FN gap (D-86) + D-85 possessive.
