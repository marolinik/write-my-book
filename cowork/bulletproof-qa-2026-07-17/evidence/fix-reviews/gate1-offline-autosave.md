# Gate 1 — "Zero words lost (all W4 disasters)" — offline-autosave close-out

**Lane:** gate1-executor (Opus) · **Branch:** `qa/bulletproof-2026-07-17` · **No commit (tree left dirty for team-lead pathspec landing).**

**Verdict:** Gate 1 is **substantially MET** for every deterministically-provable
offline disaster class (8/8 scenario classes GREEN), with **one honestly-scoped
residual**: a hard OS-level kill with *no* unload event can still drop the last
**≤150 ms** of typing (the keystroke-mirror throttle window). That residual is
now **pinned by a deterministic strong-bar test** so it can never regress
silently or be re-certified away. It is a **bounded partial loss**, never the
original D-24 total loss.

---

## STEP 0 — Architecture map & CASE determination

### CASE A — offline durability EXISTS (this is not CASE B).

The offline/crash-safety stack is real, layered, and no-throw/SSR-safe throughout:

| Layer | File | Role |
|---|---|---|
| Write-behind IDB buffer | `src/lib/offline/draft-store.ts` | Async IndexedDB draft store; 2 s cadence while dirty; 14-day prune; multi-tab `clientId` + `ifUpdatedAtEquals` guards. **NOT a save path.** |
| Synchronous last-chance mirror (D-24 fix) | `src/lib/offline/last-chance-mirror.ts` | Synchronous `localStorage` write per keystroke (throttled). Closes the sub-2 s / no-unload-event hole the IDB buffer alone left. 1 MB ceiling → falls back to IDB above it. |
| Draft-buffer hook | `src/hooks/use-draft-buffer.ts` | Composes both stores: 2 s interval `bufferNow`, keystroke `mirrorNow` (throttle `MIRROR_KEYSTROKE_THROTTLE_MS = 150`, leading+trailing), `visibilitychange:hidden`/`pagehide`/unmount flush, and the pure `decideRecovery` + `checkRecovery` (takes the newer of {IDB draft, mirror}). |
| Recovery application | `src/components/editor/draft-recovery.ts` | Applies a `RecoveryDecision` to the live pane; stale-guards; a moved server routes into the existing CAS/conflict machinery — never an unstamped overwrite. |
| Online signal | `src/hooks/use-online-status.ts` | `navigator.onLine` via events; callers also classify fetch-level failures (dead-router case). |
| Save-status honesty | `manuscript-editor.tsx` + `editor-status-bar.tsx` | States: `Saved` / `Offline — saved on this device` / `Offline — changes not saved` (honest red when IDB unavailable) / `Sync pending`. |

**Save path is untouched by the buffer:** all server writes stay on the stamped
PUT (`manuscript-editor.tsx` `saveContent`). Save-success calls `clearDraft`
(`onlyIfMine`); a **failed** save counts the failure and **does not** clear the
draft — so a failed transport can never destroy the local copy.

Because durability exists and works, the campaign's `0/8 BLOCKED-ENV` for this
class was **"untested," not "broken."** This deliverable makes it tested.

---

## STEP 1 — Deterministic offline scenario-class harness

**New file:** `tests/unit/offline-autosave-zeroloss.test.tsx` (17 tests, all green).
No network, no live browser, no LLM.

**Fidelity of the two layers:**
- **Last-chance mirror = REAL** — the actual module against jsdom's real
  `localStorage`. Its zero-settle durability is proven for real.
- **IndexedDB buffer = SIMULATED** — an in-memory `Map` honouring the same
  put/get/delete contract (incl. `onlyIfMine` / `ifUpdatedAtEquals`), because
  jsdom ships no IndexedDB. The **logic** deciding whether the words are
  written/retained/offered-back is the REAL hook + REAL decision table; only the
  storage engine is a stand-in.

| # | W4 disaster class | Assertion (writer's words) | Mirror | IDB | Status |
|---|---|---|---|---|---|
| 1 | Edit offline → reconnect | both stores hold the words; reconnect replays them intact | REAL | SIM | **GREEN** |
| 2 | Save transport throws mid-autosave | failed save never clears the draft; only a confirmed save reaps it | REAL | SIM | **GREEN** |
| 3 | Tab/browser close, unsaved buffer | pagehide flush captures the un-throttled newest tail (zero loss) | REAL | — | **GREEN** |
| 4 | Reload after offline edits | fresh tab restores the words **byte-for-byte** (no truncation/prepend) | REAL | SIM | **GREEN** |
| 5 | Concurrent offline edits, two docs | no cross-contamination — each key isolated in both stores | REAL | SIM | **GREEN** |
| 6 | Reconnect replay idempotent | restored content never duplicated ("wordswords") nor re-lost; settled server → clean `none` | REAL | SIM | **GREEN** |
| 7a | Very large buffer (~900 KB, under cap) | round-trips through the mirror intact | REAL | — | **GREEN** |
| 7b | Over-cap (>1 MB) buffer | mirror refuses (jank/quota guard) **but IDB still holds & restores** — honest fallback, no silent drop | REAL | SIM | **GREEN** |
| 8 | Rapid burst under a dead transport | leading edge durable instantly; trailing lands final within one window; IDB captures final; nothing dropped | REAL | SIM | **GREEN** |

Plus a `decideRecovery` pure-table block (5 tests) covering the zero-loss-critical
branches: a **moved server never silently overwrites** (→ conflict, both sides
preserved), and a strictly-newer offline draft is always offered back.

### What is genuinely BLOCKED-ENV (stated honestly, not claimed)

The **live-browser end-to-end** confirmation of these same eight classes — real
Chrome + real IndexedDB + a real OS-level kill — cannot run in this unit runner.
It lives in `tests/e2e/offline-autosave.spec.ts` and
`tests/e2e/w4-data-safety-drills.spec.ts` and needs the dev server on `:3002`
(not available here). So: **8/8 deterministically simulated GREEN; the browser +
real-IDB + real-crash leg is BLOCKED-ENV** and unchanged by this lane.

---

## STEP 2 — D-24 strong-bar restored (the renegotiated claim, re-pinned)

### What was renegotiated

- **Original** hard-crash re-verify (`w4-data-safety-drills.spec.ts`) asserted the
  **full** typed marker survived a zero-settle `page.close({runBeforeUnload:false})`.
- **2026-07-18 re-verify** replaced it with a **prefix-only** assertion — only the
  text typed **>200 ms** before the close was required to survive, conceding the
  last ~150 ms as "documented, accepted." The prose acknowledged the limit, but
  the **automated gate no longer holds the strong bar**, so a regression that
  *widens* the window would pass unnoticed.

> I did **not** edit `tests/e2e/w4-data-safety-drills.spec.ts` — that spec is the
> `w4-reverify` lane. The strong bar is restored deterministically in my own new
> unit file instead (more robust than the timing-dependent E2E, and runnable in CI).

### The three strong-bar tests (`describe("D-24 strong-bar …")`)

1. **`graceful/notified teardown loses zero words` — GREEN (strong bar MET).**
   Any notified teardown (tab close, SPA nav, unmount) flushes the mirror
   *unconditionally and synchronously* → the full newest tail is durable. Zero loss.

2. **`hard kill … never total loss — leading edge is durable` — GREEN (regression floor).**
   Zero settle, no timers, **no unload event**: the leading edge is still durable
   and the row is **not** the pristine baseline. This pins the floor that the
   original D-24 **total-loss** bug must never breach again.

3. **`STRONG BAR: hard kill inside the throttle window loses zero words` — documented-RED (`it.fails`).**
   Asserts the literal Gate-1 bar (newest words durable on a zero-settle hard kill
   with no unload event). **Expected to fail against current code** — it pins the
   exact ≤150 ms residual so a widening regression is caught. `it.fails` passes
   *only because the body genuinely throws*, i.e. the loss is machine-proven.

### Verbatim RED proof

Throwaway plain-`it` run of the strong-bar body (scratch file created, run, deleted):

```
FAIL  scratch RED > STRONG BAR: hard kill inside the throttle window loses zero words
AssertionError: expected 'The harbor lay quiet under the mornin…' to be 'The harbor lay quiet under the mornin…'
Expected: "The harbor lay quiet under the morning fog. kept then dropped"
Received: "The harbor lay quiet under the morning fog. kept"
```

The last in-window keystroke (` then dropped`) is not durable on a zero-settle
hard kill — only the leading edge (` kept`) survived. **Deterministic, no flake.**

### Honest D-24 status

- The re-verify's **"no more total loss"** claim is **true and holds** (floor test #2).
- The re-verify's **zero-loss framing does NOT meet Gate 1's literal bar** — a
  bounded ≤150 ms tail can still be lost on a hard kill with no unload event
  (RED test #3). D-24 is fixed to a **bounded-partial-loss floor**, not zero-loss.

---

## Proposed minimal fix for the residual (awaiting team-lead go — reverses a reviewed decision)

The ≤150 ms window is the deliberate `MIRROR_KEYSTROKE_THROTTLE_MS = 150`
leading+trailing throttle in `use-draft-buffer.ts` (added in the D-24 review,
commit `e26a0e3`, as a perf guard against per-keystroke `localStorage` writes).

**Minimal fix:** write the mirror on **every** keystroke (drop the trailing
*delay*; keep the cheap skip-hash), bounded by the existing **1 MB** `LAST_CHANCE_MAX_MARKDOWN_LENGTH`
cap (above which the mirror already opts out to IDB). Within that cap a
synchronous `stringify` + `setItem` is sub-millisecond for typical chapter sizes;
the editor already serialises markdown per keystroke for the live word count, so
the marginal cost is the write itself.

**Why I did not just land it:** it reverses a reviewed perf tradeoff and would
require rewriting the existing throttle-behaviour assertions in
`tests/unit/use-draft-buffer-mirror.test.tsx` (which currently assert exactly one
mirror write per burst). That is a behaviour change with a perf implication —
flagging for a decision rather than silently reversing it. When it lands, delete
`.fails` from strong-bar test #3 and it goes GREEN.

**Alternative (if per-keystroke writes are unwanted for large docs):** keep the
throttle but document ≤150 ms as the *accepted* Gate-1 floor and treat test #3 as
a permanent `it.fails` characterization. Founder call.

---

## Gates

- `npx tsc --noEmit` → **exit 0**.
- New file `tests/unit/offline-autosave-zeroloss.test.tsx` → **17/17 pass** (incl.
  the `it.fails` strong-bar RED).
- Existing D-24 unit files unchanged & green: `last-chance-mirror.test.ts` (9),
  `use-draft-buffer-mirror.test.tsx` (10).
- **Full unit suite: 139 files / 1124 tests, 0 failures** (baseline ~135 / ~1098;
  +1 file / +17 tests mine, remainder from other lanes landing since snapshot).
  No in-flight RED observed at run time.

## Pathspecs touched (no commit)

- `tests/unit/offline-autosave-zeroloss.test.tsx` (new)
- `cowork/bulletproof-qa-2026-07-17/evidence/fix-reviews/gate1-offline-autosave.md` (this file)

**Out of scope / untouched (other lanes):** `tests/e2e/w4-data-safety-drills.spec.ts`
(`w4-reverify`), all `src/**` product code (no product change made this lane).
