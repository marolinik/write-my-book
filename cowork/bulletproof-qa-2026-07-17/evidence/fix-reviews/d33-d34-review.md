# Gatekeeper review: D-33 + D-34 (CreateFinding input validation)

Worktree: D:\Projects\wmb-pub\.claude\worktrees\agent-af3daacd3ac4ba2d3
Branch: worktree-agent-af3daacd3ac4ba2d3 (based on qa HEAD f6ddf23)
Commits reviewed: b38e563 (D-33), 22380d9 (D-34)
Files touched: src/lib/agents/tools.ts (+65/-5), tests/unit/finding-input-validation.test.ts (new, 366 lines, 12 tests)

## Verification performed (independent, not trusting fixer claims)

1. Full diff read (git diff f6ddf23..22380d9) -- confined to validateFinding (lines 93-192) and the rejection-analytics block in executeCreateFinding (lines 1236-1310). No other files reference validateFinding/ValidationInput.
2. Guard ordering -- traced every use of anchorQuote, paragraphNumber, alternatives in validateFinding. Each new type guard sits strictly before the first use of that field: anchorQuote guard before fuzzyMatch; paragraphNumber guard before paragraphs[input.paragraphNumber-1]; Array.isArray guard before .findIndex; per-item originalText guard before computeGroundingScore/D-13 matching (both only touch originalText, never newText/label). No crash path slips through.
3. D-13 suppression block untouched (tools.ts:1338-1372) -- all new rejections return from validateFinding before executeCreateFinding reaches this block, so input.alternatives[0]?.originalText is guaranteed a string by the time D-13 dismiss-matching runs. Empty-string originalText explicitly preserved as valid (test l), confirmed by direct test run.
4. D-30 isolation -- executeUpdateGraphEntity (line 1499, the D-30 ctx.bookId threading fix) is nowhere near the touched hunks; confirmed via diff line numbers.
5. Analytics write path -- confirmed via executeTool outer try/catch (tools.ts:2106-2110) that pre-fix, a thrown TypeError inside validateFinding propagated straight past the db.editFinding.create analytics call and was caught only at the top level as "Error executing CreateFinding: ...". The analytics write was fully bypassed for these crash inputs. Post-fix, the guards return normally so the write executes. Strictly additive; no prior analytics data existed for these cases to lose.
6. Sanitization correctness -- paragraphNumber Int? and anchorQuote String? at db.Text confirmed nullable in prisma/schema.prisma lines 426-461, matching the null-on-wrong-type sanitization. Traced every other rejection branch reachable after the new guards (out-of-range paragraph, anchor-not-found, paragraph-mismatch, alternatives-too-short) -- in each case the sanitized field already passed its type guard by that point, so no previously-valid analytics data is nulled out. Verified concretely: test e (out-of-range paragraphNumber=99) still stores paragraphNumber 99, not null.
7. Message consistency -- grepped all REJECTED: strings in the file; all seven follow the same shape (field name, requirement, what was provided, corrective instruction), no internals or stack traces leaked, consistent with the pre-existing alternatives-length message.

## RED-baseline claims -- empirically verified, not just spot-checked

- Checked out tools.ts at f6ddf23 (pre-D-33) with the new test file at HEAD, ran finding-input-validation.test.ts: exactly 4/6 failed in the D-33 group (a, b, c, d failed; e, f passed) -- matches fixer claim precisely.
- Checked out tools.ts at b38e563 (post-D-33, pre-D-34): exactly 5/12 failed (g, h, i, j, k failed; a-f and l passed) -- matches fixer claim precisely.
- Restored tools.ts to HEAD (git checkout HEAD -- src/lib/agents/tools.ts), confirmed worktree clean and all 12 tests green again before concluding.

## Behavior-change risk probed: numeric-string paragraphNumber

Test c sends paragraphNumber "2" (a valid-in-range value, wrong type). Traced the pre-fix code path by hand and confirmed empirically: JS comparison operators coerce "2" numerically, so it passed the old range check, paragraphs["2"-1] (arithmetic coercion) resolved to the correct paragraph, fuzzyMatch succeeded, and the call returned "Finding created (id: new-finding-1, ...)" -- not a crash -- silently writing the string "2" toward an Int? column.
This is a genuine behavior change (previously "succeeding" malformed input is now rejected), but it is the correct fix: Prisma real client throws a runtime PrismaClientValidationError on a string value for an Int field, so the old "success" was actually a latent crash deferred to the db.editFinding.create call in production (just not observable against vitest type-agnostic mock db). Fixer reasoning holds up under direct inspection, not just trust.

## Full verification suite run in worktree

- npx tsc --noEmit: clean, 0 errors.
- npx vitest run: 611/611 passed, 89/89 files.
- npx vitest run tests/unit/finding-input-validation.test.ts: 12/12 passed at HEAD.

## Findings

No CRITICAL, HIGH, MEDIUM, or LOW issues found. All six of the fixer claims were independently verified against the code and by re-running tests at the relevant historical commits, not merely re-read. Guard ordering is correct, D-13/D-30 are untouched, analytics sanitization is lossless for pre-existing paths and strictly gains coverage for the crash cases, and both RED baselines reproduce exactly as claimed.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 0     | pass   |

Verdict: SAFE -- approve, no issues found.

---
LANDED: cherry-picked as 8f0d412 (D-33) + 2f376c2 (D-34) on qa/bulletproof-2026-07-17. tsc clean, 611/611 green on qa branch post-pick.

GATED APPLY WINDOW (user-approved 2026-07-18 ~16:25):
- repair-duplicate-documents --execute: 1 group merged, 3/3 snapshots re-parented, dup row deleted
- prisma db push (--accept-data-loss, run by user): @@unique(book_id,type,chapter_number) applied to dev DB
- repair-cross-book-edges --execute: 2 contaminated edges deleted, 38 ambiguous + 1 anomaly retained for manual review, flag 52af6dc9 marked re-scan
- D-16 re-verify: constraint PRESENT (documents_book_id_type_chapter_number_key), duplicate insert rejected P2002 (scripts/verify-d16-constraint.ts) -- D-16 now FIXED-VERIFIED at DB layer
