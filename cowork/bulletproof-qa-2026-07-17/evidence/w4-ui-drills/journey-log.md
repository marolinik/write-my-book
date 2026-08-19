# W4 — UI Data-Safety Drills

Persona: p5-sam (fork), dispatched to cover the manual gaps NOT exercised by
`tests/e2e/offline-autosave.spec.ts` (two-tab edit war, immersive-mode unload
flush, and rapid-nav console hygiene), plus re-run the network-kill/crash-restart
scenarios against an env-unblocked persona.

Run command for all specs below:
```
PLAYWRIGHT_BASE_URL=http://localhost:3002 E2E_TEST_SECRET=test-secret \
  npx playwright test <spec> --project=chromium --workers=1 --reporter=list
```
(`:3002` is wmb-pub's dev server on this machine — the Playwright default baseURL
of `:3000` resolves to an unrelated app.)

## 1. `tests/e2e/offline-autosave.spec.ts` (existing suite)

**BLOCKED-ENV**, 0/8. `global-setup.ts` wipes `user_test_e2e`'s `subscriptions` row
every run and never reseeds one, so every test 403s the plan/quota gate before the
test body runs. Not a product defect — a test-fixture/seed gap. Not re-litigated
this session (established in a prior window).

## 2. `tests/e2e/x1-two-tab-conflict.spec.ts` (new, this drill)

**PASS, 2/2.** Two genuinely independent browser contexts, same persona
(`user_qa_p2`), racing real concurrent writes on the same chapter:
- Losing tab gets an honest 409, a non-blocking "Review" status-bar chip (dialog
  never auto-opens, typing never interrupted), and its own words stay live in its
  editor with nothing silently reverted or overwritten.
- "Load theirs" backs up the loser's discarded words as a real, fetchable
  `conflict-backup` DocumentVersion row before replacing the live content — no
  silent data loss on that path either.

Screenshots: `screenshots/x1-b-conflict-chip-dialog-closed.png`,
`screenshots/x1-b-conflict-dialog-open-diff.png`.

Two real bugs found and fixed live during this drill's own development (not
product defects in the shipped app, but in the test fixture / API contract
understanding): POST /api/books auto-creates chapter 1 now, so a follow-up
explicit chapter-1 creation 500s on the unique constraint; and the shared
campaign throwaway fixture was live-contaminated by another persona's concurrent
probe mid-run, which is why this spec seeds its own fresh book+chapter per test
rather than reusing shared state.

## 3. `tests/e2e/w4-data-safety-drills.spec.ts` (new, this drill)

Final full run: **1 passed / 5 failed** (see `_results.json`). Breakdown:

| Test | Verdict |
|---|---|
| Z14 clean-exit + crash, 0s burst | FAIL → **D-23** |
| Z14 clean-exit + crash, 5s burst | FAIL → **D-23** |
| Z14 clean-exit + crash, 30s burst | FAIL → **D-23** |
| Network-kill: dead PUT route, self-heals on route restore | **PASS** |
| Crash-restart: hard crash mid-typing, plain editor | FAIL (intermittent, ~50%) → **D-24** |
| Z13: rapid nav + rapid panel toggle console hygiene | FAIL → triaged, see below |

**Z14** — all 3 sub-tests fail at the *clean-exit* assertion, before the crash leg
is ever reached, so the crash/reload-recovery behavior specifically under
immersive mode remains formally untested. Extensive elimination work (explicit
cursor positioning, human-cadence per-character typing, console/HMR-signature
checks) points to a real, timing-sensitive product bug in the immersive
content-sync path rather than a test-tooling artifact. Full writeup: `defects.md`
§D-23.

**Crash-restart** (plain editor, no immersive) was re-run 4 times total this
session (1 in the full-suite run + 3 standalone reruns) to rule out a one-off
flake: **2 failed / 2 passed**. On failure the reopened editor shows the pristine
baseline with zero trace of the typed marker — no partial-loss floor. This
contradicts the FLAGSHIP-ADDENDUM's "small worst-case window" claim for hard
crashes. Full writeup: `defects.md` §D-24.

**Network-kill** (dead PUT route via `page.route` abort, then restored) passed
cleanly: save status correctly shows "Sync pending" while the route is dead and
self-heals to "Saved" once the route is restored, with no data loss.

**Z13** — triaged via a throwaway single-page-load control test before deciding
what's genuinely rapid-nav-specific vs. ambient env noise:
- `ERR_NAME_NOT_RESOLVED` (Clerk placeholder-domain DNS failure, 6× per load) —
  **ambient noise**, present on any plain page load. Broadened the spec's error
  filter to exclude it (permanent fix to the test, not a product defect).
- React 19 `useId()` hydration mismatch on Radix-generated ids inside
  `CommandPalette`/`DropdownMenuTrigger` — **confirmed genuinely rapid-nav-
  specific** (absent from the control run). Real console-hygiene finding, flagged
  in `defects.md` for team-lead to assign a number (not claimed unilaterally,
  since it's UI-hygiene territory that may overlap another persona's findings).

## Process notes

- Re-verified the highest live `D-NN` immediately before each filing per campaign
  discipline. Found D-21 → D-22 (claimed by p3-selena between my check and filing)
  → filed **D-23** and **D-24**.
- Per prior instruction (relayed from p2-gerald's D-16 finding), no `src/` files
  were modified to root-cause D-23 — all investigation was black-box via
  Playwright. This means D-23's exact triggering line is not pinned down, only
  the defect's realness and rough mechanism.
- Two throwaway diagnostic specs (`_debug-z14.spec.ts`, `_debug-z13-control.spec.ts`)
  were created and deleted during investigation; neither is present in the final
  tree.
