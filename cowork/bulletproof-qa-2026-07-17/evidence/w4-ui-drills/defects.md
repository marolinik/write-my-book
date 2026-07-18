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
