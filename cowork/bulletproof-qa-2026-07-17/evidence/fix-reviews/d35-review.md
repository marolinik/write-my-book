# D-35 gatekeeper review -- setup wizard Finish Setup silently no-oped

Reviewer: independent gatekeeper. Target: worktree agent-ab46a9fe955e38c34, branch worktree-agent-ab46a9fe955e38c34, base 0dde596. Commit reviewed: 45863f6.

Fix for D-35 (P6 Owen C-1, S2): updateSettingsSchema lacked setupComplete and setupImportSkipped, so Zod stripped the wizard PATCH keys, the route 200-no-oped, and SETUP-07 then 422-walled every non-setup workflow for paste-in stylists.

Every claim below was reproduced independently in the worktree; nothing was taken on trust.

## Verified

1. Diff shape: two files only, validation.ts +6/-0 and settings-route.test.ts +235/-0, 241 insertions, 0 deletions. The 6-line hunk adds only the two optional booleans to updateSettingsSchema.

The settings route.ts is untouched (absent from the diff, confirmed unchanged at HEAD).

2. RED reproduces: checked out validation.ts at parent 0dde596 against the HEAD test file, ran the new test file: 11 failed, 3 passed, 14 total -- exact match to the commit message.

Worktree restored to clean HEAD afterward (git status empty).

3. GREEN: new test file 14/14 pass at HEAD. Full suite: 625/625 pass, 90/90 files, exit 0 (some tests print expected stderr for simulated errors, not real failures). tsc --noEmit: 0 errors.

4. SETUP-07 tests are real, not tautological: they import the real PATCH and the real agent POST handler, only mocking auth/db/downstream LLM seams.

Verified the gate logic at agent route.ts lines 112-137 matches the test assertions exactly (setupComplete true skips the doc-existence check entirely;
 false falls back to it and 422s with the literal response body the route returns).

5. Non-boolean setupComplete now 400s: RED showed 200 (silent success), GREEN shows 400 with no persistence.

6. Other unknown keys still strip: the guard test pins this, and its RED-state failure was specifically about setupComplete, not about the unknown key leaking -- confirms it is a real regression guard.

7. Rebase is clean: two-file, additions-only diff matching the commit message's own line counts, no stray hunks from other D-33..D-42 work.

## Risk probes

Security/ownership: PATCH requires requireUser plus book.findFirst scoped to the caller's own userId -- unchanged by this fix, no cross-tenant or tier-bypass path.

setupImportSkipped downstream: only read by use-book-state.ts for a wizard progress checkmark, not involved in the SETUP-07 gate -- low risk if corrupted.

Symmetry vs the spec's one-way clause -- genuine non-blocking finding: docs/superpowers/specs/2026-07-01-write-first-onboarding-design.md line 212 calls setupComplete permanent / one-way and says there is no UI to re-enable onboarding offers.

The fixer's claim that this only concerns word-count resets is a narrower reading than the text supports.

The fix adds and tests PATCH setupComplete false as intentional symmetric behavior, which is a brand-new capability (pre-fix the key could not be written at all).

This can re-arm onboarding offers and can re-trigger the exact D-35 422-wall for paste-in stylists who lack a story bible or architecture doc, since SETUP-07 falls back to the doc-existence check when setupComplete is false.

Mitigation confirmed directly: no current UI path can send this. The general settings-page mutation is typed via BookSettingsData, which does not include these two fields at all, so the settings form cannot serialize them even by accident.

Only the wizard's Skip Import and Finish Setup buttons call this PATCH, and both only ever send true. Setting false requires a deliberate raw API call by the book's own owner -- same-tenant self-sabotage, not a security hole,
 but it does reopen the exact failure mode D-35 exists to close, and it should not be treated as pre-approved just because no spec doc explicitly forbids it.

Recommend a product decision on whether to keep this symmetric or make the field one-way in the route.

## Verdict

SAFE

The fix is exactly the claimed minimal 6-line schema change plus a 235-line non-tautological test file.
 RED and GREEN both reproduced independently (11/14 fail pre-fix, 14/14 plus 625/625 full suite plus tsc 0 post-fix). SETUP-07 tests genuinely exercise real gate logic. No ownership or tier bypass introduced.

One non-blocking finding: the fix makes setupComplete API-resettable to false, reachable only via a raw API call today but in tension with the spec's permanent/one-way language -- flagged for a product decision, not required before merge.

Worktree left clean at 45863f6.
