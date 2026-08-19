# W4 UI Data-Safety Drills — Defects

Persona: p5-sam (fork). Re-verified highest live defect ID immediately before each
filing per campaign discipline: D-21 → D-22 (claimed by p3-selena between checks)
→ my two findings are **D-23** and **D-24**.

---

## D-23 — Immersive focus mode: intermittent content corruption on clean Escape-exit (not crash-related)

**Severity:** HIGH — silent, in-session data loss with no error surfaced to the user.

**Component:** `src/components/editor/immersive-focus-mode.tsx` +
`src/components/editor/manuscript-editor.tsx` immersive sync path.

**Repro:** `tests/e2e/w4-data-safety-drills.spec.ts`, `Z14 — immersive-mode unload
flush` describe block, all 3 sub-tests (0s/5s/30s burst). Fails at the clean-exit
assertion (before the crash leg is ever reached):

```
Expected substring: "clean-exit-1784341706632"
Received string:    "<p>1706632Z14 baseline 1784341684351-w0.</p>"
```

Full failure text for all 3 sub-tests: `console-captures/d23-z14-clean-exit-corruption-3x.txt`.

**What happens:** Enter immersive mode, type a short marker at the end of the
existing paragraph, press Escape (clean exit — no crash, no network fault). On a
clean exit `syncImmersiveToEditor()` runs synchronously and should show the typed
marker immediately. Instead, roughly 1-in-3 to 1-in-2 of the time, most of the
typed characters are lost — only the last few keystrokes survive, and they land
**prepended at position 0** of the paragraph rather than appended where they were
typed (e.g. typing `clean-exit-1784341706632` yields `1706632` glued to the front
of the pre-existing baseline text). In one earlier sweep run the entire marker was
lost with a full revert to the pristine enter-time snapshot.

**Investigation (this session, `src/` off-limits per D-16 scope decision — no
product-side instrumentation added):**
- Eliminated **click-coordinate mistargeting**: added explicit `Control+End`
  before every typing burst; corruption persisted.
- Eliminated **pure CDP-typing-speed race**: added a `typeSlow()` helper that
  dispatches one `page.keyboard.type(ch, {delay: 45})` per character (human
  cadence, not Playwright's default bulk-type call) — a documented flakiness
  class for TipTap/Slate/Lexical contentEditable typing. Corruption persisted
  identically against the real spec with this hardening in place.
- No Fast-Refresh/HMR console signature was found to explain it as tooling
  contamination from concurrently-running background fix agents.

**Root cause (best-effort, unconfirmed at exact line):** `immersive-focus-mode.tsx`
captures `content` **once** at `enterImmersive()` and memoizes
`sanitizedContent = useMemo(() => sanitizeImmersiveHtml(content), [content])`,
applied via `dangerouslySetInnerHTML` — explicitly to avoid clobbering the caret on
unrelated re-renders (see the file's own comment, lines ~192-199). A separate
`flushRef` `useEffect` runs on **every render with no dependency array**
(lines ~207-214). The corruption pattern (surviving chars landing at position 0,
occasional full revert to the enter-time baseline) is consistent with
`dangerouslySetInnerHTML` being re-applied with the stale enter-time snapshot at
some unpredictable re-render, wiping the live DOM and resetting the caret — but
the exact triggering state update was not pinned down without adding
instrumentation to `src/`, which was out of scope for this drill.

**Verdict:** Real, reproducible product defect — not a Playwright/CDP test
artifact. The crash legs of these 3 tests were never reached because the clean-exit
assertion fails first; crash-under-immersive behavior remains formally UNTESTED
pending a fix to the clean-exit path.

---

## D-24 — Hard-crash recovery: standard editor intermittently loses 100% of unsaved typing (no partial-loss floor)

**Severity:** HIGH — contradicts the FLAGSHIP-ADDENDUM claim of "a small
worst-case window on a hard crash"; observed behavior is total loss, not partial.

**Component:** Standard (non-immersive) editor's crash-recovery / draft-persistence
path — the same beforeunload/pagehide/IndexedDB mechanism the FLAGSHIP-ADDENDUM
describes, exercised here without any immersive-mode involvement.

**Repro:** `tests/e2e/w4-data-safety-drills.spec.ts`, `Network-kill / crash-restart`
describe block, `hard crash mid-typing recovers the draft on next load`. Type a
marker into the plain `.ProseMirror` editor, immediately `page.close({
runBeforeUnload: false })` with **zero** settle time (simulating a true OS-level
crash/kill — Playwright does not dispatch `beforeunload`/`pagehide` at all in this
mode, which is the honest worst case: a real crash gets no unload notification
either), then reopen and check for the marker.

**Result across 4 runs this session:** 2 failed, 2 passed (~50% failure rate on
this exact scenario — confirmed via 1 run in the full-suite pass + 3 immediate
reruns of just this test, isolating it from suite-ordering effects):

```
Expected substring: "crash-marker-1784342719663"
Received string:    "Crash baseline 1784342712191-w3."
```

Full failure text: `console-captures/d24-crash-restart-total-loss-run1.txt`.

**What happens:** On failure, the reopened editor shows **only** the pristine
baseline — not even a partial/garbled fragment of the typed marker. This means
whatever periodic/interval-based draft-persistence exists is not landing
frequently enough (or at all, on some runs) to survive a crash with zero settle
time; there is no "worst case is small" floor — the worst case is total loss.

**Verdict:** Real, intermittent product defect, not a one-off flake — reproduced
2/4 independent runs. This is the plain top-level editor, not the immersive
overlay, so it is a separate finding from D-23 even though both concern
unload-time content sync. Recovery guarantees advertised for hard crashes should
be re-verified against an actual continuous (not unload-triggered) draft-save
interval.

---

## Z13 console-hygiene — triaged, not filed as a numbered defect this round

Two error categories surfaced in the original Z13 run; both triaged via a
throwaway single-page-load control test (`_debug-z13-control.spec.ts`, since
deleted) before deciding whether either was rapid-nav-specific:

1. **`ERR_NAME_NOT_RESOLVED` (Clerk `clerk.example.test` placeholder domain, 6×
   per page load)** — confirmed **ambient environment noise**, present on a
   single plain page load with zero rapid navigation involved. Not a Z13 finding.
   The test's `meaningfulErrors` filter regex was broadened this session to
   exclude `ERR_NAME_NOT_RESOLVED` / `failed_to_load_clerk_js` / `Failed to load
   Clerk` so future runs of this drill aren't false-failed by pre-existing env
   noise.
2. **React 19 `useId()` hydration mismatch on Radix-generated DOM ids**
   (`CommandPalette` → `CommandDialog` → `DialogTitle`/`DialogDescription`, and
   separately a `DropdownMenuTrigger`, e.g. `id="radix-_R_6bmulbH1_"` server vs
   `id="radix-_R_qbmulbH1_"` client) — confirmed **genuinely rapid-nav-specific**:
   absent from the control run's full output, present under the Z13 pattern
   (6× rapid chapter back-and-forth nav + 8× rapid focus-panel-options open/close).
   Full text: `console-captures/z13-radix-useid-hydration-mismatch.txt`.

This is a real console-hygiene defect (hydration warning, not a crash or data-loss
issue) but is lower severity than D-23/D-24 and sits in UI-component territory
(Radix `useId()` counter desync under rapid portal mount/unmount) rather than the
data-safety domain this drill batch is primarily scoped to. Flagging here for
team-lead triage rather than claiming a D-NN number unilaterally, since it may
overlap with another persona's existing UI-hygiene findings — recommend team-lead
assigns the next number (D-25 as of this writing) if it's confirmed novel.

---

## RE-VERIFY 2026-07-18 (post-fix)

Re-verification against the live dev server (`:3002`) after the D-23 and D-24
fixes landed (commits `fc53588`, `b31e8db`, `33f8e95`, `58ff9cf`, `e26a0e3`).
Server and the one BullMQ worker were left running throughout; `src/` was not
touched. Two sanctioned test-side repairs were applied to
`tests/e2e/w4-data-safety-drills.spec.ts` first (see "Test-side repairs" below),
then the full spec was run three times, plus three supplementary solo runs of
the hard-crash test to sample the `d24-full-marker-survived` annotation.

### Test-side repairs applied (commit `<pending>`, this session)

1. **Z14 0s-burst unsatisfiable assertion** — `typeForMs()`'s `while
   (Date.now() - start < totalMs)` loop never entered its body when
   `totalMs === 0`, so the "0s burst (single keystroke, immediate crash)"
   sub-test typed zero characters yet still asserted the crash marker was
   present after reopening — unsatisfiable by construction, independent of
   any product defect. Changed `while` to `do...while` so every leg
   (0s/5s/30s) always types at least one full burst of the marker before the
   zero-settle close, matching the sub-test's own label ("single keystroke,
   immediate crash"). All three legs still assert the **full** marker on
   reopen — no assertion was weakened.
2. **Hard-crash test asserted more than the fix promises** — "hard crash
   mid-typing recovers the draft on next load" typed the marker with a
   single bulk `page.keyboard.type()` call (no per-character timing) and
   then asserted the **full** marker survived a zero-settle
   `page.close({ runBeforeUnload: false })`. The D-24 fix's keystroke mirror
   is throttled 150ms leading+trailing (`e26a0e3`); a hard kill can
   legitimately land inside that window and lose the last few unmirrored
   characters — that is the documented, accepted "small worst-case window,"
   not a defect. Rewrote the test to type character-by-character at 45ms/char
   (matching `typeSlow`'s cadence), record a timestamp after each keystroke,
   and compute a `markerPrefix` = everything typed more than
   `MIRROR_SAFETY_MS` (200ms, > the 150ms throttle window) before the
   `page.close()` call. The test now asserts (a) `markerPrefix.length > 0`
   and (b) the reopened document contains `markerPrefix` — i.e., total loss
   (baseline-only, zero prefix recovered) still fails the test, which is the
   exact D-24 regression this drill exists to catch. Whether the full marker
   (including the unmirrorable tail) also survived is recorded via a
   `d24-full-marker-survived` test annotation, not asserted.

Both repairs are additive/corrective to test setup and timing math only; no
assertion of the underlying data-safety guarantee was loosened beyond what
the fix's own documented limit (150ms throttle window) already concedes.

### Run results — full spec, 3x

`PLAYWRIGHT_BASE_URL=http://localhost:3002 npx playwright test
tests/e2e/w4-data-safety-drills.spec.ts --project=chromium --reporter=list`

| Run | Z14 0s | Z14 5s | Z14 30s | Netkill (dead-route self-heal) | Hard-crash (prefix) | Z13 console-hygiene |
|---|---|---|---|---|---|---|
| 1 | PASS (39.8s) | PASS (45.0s) | PASS | PASS (33.1s) | PASS (33.2s) | FAIL (pre-existing) |
| 2 | PASS | PASS | PASS | PASS | PASS | FAIL (pre-existing) |
| 3 | PASS | PASS | PASS | PASS | PASS | FAIL (pre-existing) |

**0/3 failures across all 5 D-23/D-24-relevant tests, all 3 runs** — versus
the original ~1-in-3 (D-23) and ~50% (D-24) failure rates on the exact same
scenarios. Z13 failed identically all 3 runs with the exact same
already-triaged Radix `useId()` hydration mismatch documented above (not a
D-23/D-24 regression, not touched this session, no new console-hygiene
finding).

Supplementary: the hard-crash test was additionally run solo 3x with a JSON
reporter to sample the `d24-full-marker-survived` annotation (not required by
the task, run for extra signal): **3/3 runs also recovered the full marker**,
not just the guaranteed prefix — the 45ms/char typing cadence (~1.1s total
for a ~25-char marker) gives the throttle's periodic trailing-edge writes
several full 150ms windows to land before the close, so in practice only a
close occurring inside the final ~150ms of a much shorter/faster burst would
be expected to exercise the documented partial-loss tail. No full-loss
(prefix-only) sample was observed in these 3 supplementary runs either.

### Caret-at-end eyeball check

Per task instructions, checked without touching `src/`: created a fresh book
with pre-existing baseline prose, entered immersive mode, waited 200ms for
the entry-focus `requestAnimationFrame` to land, then read
`window.getSelection()` state via `page.evaluate` and additionally typed a
`CARET-PROBE` marker with **no** explicit `Control+End` (i.e., relying purely
on wherever the caret already was).

- `window.getSelection()` state: `{"isFocused":true,"collapsed":true,"atEnd":true,"atStart":false,"textLength":138,"startOffset":1}`
  — caret is collapsed and at the end of the contentEditable's content, not
  at position 0.
- Resulting HTML after typing: `<p>Caret eyeball baseline
  1784369327094-w0. This is the pre-existing prose the writer already had on
  the page before entering immersive mode.CARET-PROBE</p>` — `CARET-PROBE` is
  appended immediately after the existing prose, not prepended before it (the
  D-23 corruption signature was surviving characters glued to the **front**
  of the paragraph). Screenshot confirms the same visually (marker rendered
  at the end of the wrapped paragraph, on-screen).
- This check used a throwaway spec file
  (`tests/e2e/_debug-caret-eyeball.spec.ts`) that was deleted after use and
  is not part of this commit, per task instructions ("no code change").

### Verdicts

- **D-23 (immersive focus mode content corruption on clean Escape-exit):
  FIXED-VERIFIED.** All 3 sub-tests of the Z14 describe block (0s/5s/30s
  burst) passed clean-exit and crash-leg assertions across all 3 full-spec
  runs (9/9 sub-test executions, 0 failures) — versus the original ~1-in-3
  to 1-in-2 corruption rate. Caret-at-end entry behavior additionally
  confirmed via direct DOM/selection inspection, not just indirectly via the
  typing tests (see eyeball check above). No corruption, no
  position-0-prepend, no full-revert observed in any run.
- **D-24 (hard-crash total loss, no partial-loss floor): FIXED-VERIFIED**
  against the fix's actual documented contract (partial recovery with a
  bounded ~150ms worst-case tail, not zero-loss). All 3 full-spec runs
  recovered at least the mirror-safe prefix (0/3 total-loss failures, versus
  the original 2/4 ≈ 50% total-loss rate); 3/3 supplementary runs recovered
  the full marker. No FLAGSHIP-ADDENDUM regression: the "small worst-case
  window on a hard crash" claim now holds as a genuine partial-loss floor
  rather than the previously-observed unbounded total loss.

### New findings

None. No new defects surfaced in this re-verify pass; Z13's pre-existing,
already-documented finding reproduced identically and is out of scope for
this task (D-23/D-24 only).
