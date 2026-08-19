# D-132 / D-133 / D-134 / D-135 fix lane — touch accept, server flush, persistent wall
2026-07-26 · branch `qa/bulletproof-2026-07-17` · commit `5ea1700` (fix lane + refinements, single commit)
Method: TDD RED-first, 3 parallel opus lanes (wf_8d89358b-512, 46 agents: 3 executors + gate + 3-lens adversarial review + 3-refuter panel per finding) → opus refinement wave (wf_87499c48-4ce, 2 executors + re-gate) → Fable orchestration/verify per [[model-orchestration-policy]].

## What landed

| Defect | Fix | Where |
|---|---|---|
| **D-132 (S2, v5 grade floor)** | Ghost overlay is itself the tap target on coarse pointers: `preventDefault` at pointerdown keeps the ghost alive past the selectionUpdate dismiss, pointerup within 10px slop accepts via the shared `acceptSuggestion` (drag/scroll that starts on the overlay cancels — no accidental insert), accept-then-focus keeps the writing flow. Visible "Tap to accept" pill (rounded, bg-primary/10, part of the tap area). Fine pointers keep the ORIGINAL passive `pointer-events-none` overlay + subtle "Tab ↹" (desktop click-through/caret semantics unregressed). Inline-edit F2 kbd badge hidden on coarse pointers (menu path covers touch). | `ai-ghost-text.tsx`, new `use-coarse-pointer.ts`, `inline-edit-popup.tsx` |
| **D-133 (S2-cond)** | `useServerSaveFlush` (new `save-flush.ts`) flushes the SAME version-stamped CAS PUT on `pagehide` + `visibilitychange:hidden` with `fetch keepalive` — the accepted sentence reaches the SERVER, not just the same-profile IDB/localStorage mirror. Pure decision table `shouldFlushServerSave` (skip: clean, in-flight, conflict-suspended, offline — also bounds visibility flip-flap). Keepalive: 60KB single-body cap + module-level in-flight byte budget (`reserveKeepaliveBudget`) because the whatwg limit caps the SUM across requests and split view mounts two panes; over budget → plain fetch fallback, never a throw; release on settle covers the page-survival (phone backgrounding) path. Immersive buffer reconciles into tiptap BEFORE serialize. Survival responses run the normal 409/no-op/dirtiness/draft-clear machinery — CAS never corrupted. | new `save-flush.ts`, `use-documents.ts` (keepalive threading), `manuscript-editor.tsx` (thin wiring) |
| **D-134 (S3)** | Cap wall (429, `upgradeToTier`) now renders a persistent `role=alert` banner instead of a cooldown-throttled toast: verbatim server copy + min-44px "Upgrade" → `/settings/billing` + min-44px dismiss. Top-anchored (`top-[calc(6rem+env(safe-area-inset-top))]`) — soft keyboard and bottom nav can never occlude it (v5's bottom toast covered the nav, D-136 note). Wall state suppresses further ghost fetches for `WALL_RETRY_MS`=5min (no doomed per-pause 429s), then re-probes: still capped → banner re-shows (honest re-entry, the D-134 point), success → banner + wall clear (kills stale-copy risk). Dismiss hides the banner only — suppression holds, no ~1.5s bounce-back. Per-message 60s cooldown untouched for non-wall toasts. | `ai-ghost-text.tsx`, `quick-assist-client-errors.ts` (`isWallSuppressionActive`) |
| **D-135 (S4)** | `settings.byokDescription` provider-neutral in all 7 locales ("You pay your AI provider directly for token usage." + proper translations); test bars provider names (Anthropic/OpenAI/OpenRouter/Google) in every locale. Per-provider strings (provider cards) untouched — correctly scoped there. | `ui-strings.ts`, new `byok-copy.test.ts` |

Tests: RED-first evidenced in every lane (failure output captured before implementation). Suite **1351/1351 across 162 files** (baseline 1297/159; +54 tests, +3 files), `tsc --noEmit` 0. Full-suite gate run twice (post-fix 1335, post-refinement 1351).

## Review panel → refinement disposition
13 findings → 10 confirmed / 3 refuted (the three "60KB fallback loses long chapters" variants — refuted: local mirror + recovery covers, comment does not overstate). All 10 addressed:
- F1 desktop regression (always-tappable overlay) → coarse-gated, fine pointer reverts to passive overlay.
- F3/F6 pointerdown-accept vs scroll-start → pointerup + 10px slop + drag-cancel.
- F4/F10 inert dismiss + doomed refetch loop + stale copy → wall suppression w/ 5min expiry, dismiss ≠ re-arm, success clears.
- F5 (HIGH) keyboard-occluded bottom banner → top-anchored.
- F7 invisible 10px/20% hint → readable pill.
- F8 sub-44px banner controls → min-h-11 targets.
- F2 split-view global keepalive sum breach → module-level byte budget.
- F9 immersive z-order → verified + documented, **promoted to D-137** (below), z-values deliberately unchanged.

## New defect registered
| ID | Sev | Finding |
|---|---|---|
| **D-137** | S4-cond | Ghost text stays armed during immersive mode: `AIGhostText` mounts ungated on `!immersive`; the immersive sync scheduler's `editor.commands.setContent` (manuscript-editor.tsx:973) emits `update` (TipTap 3.19 default `emitUpdate=true`; contrast initial-load setContent which suppresses it), so pauses can fire real billable ghost fetches whose overlay (z-50) and wall banner (z-40) render INVISIBLY under the immersive overlay (z-[100]). Writer pays for suggestions they can never see; a cap hit inside immersive is a silent wall until exit. Fix shape: gate AIGhostText on `!immersive` (or `emitUpdate:false` on the sync + explicit dirty mark). Discovered by the refinement executor verifying panel finding F9. |

## Accepted residuals (logged, not fixed)
- Split view renders two `AIGhostText` instances → duplicate wall banners possible; phone persona never splits. (Keepalive budget DOES cover split-view flushes.)
- Desktop click on ghost region cannot tap-accept (deliberate: F1 decided coarse-only interactivity; Tab remains the hardware path).
- Banner may overlay the sticky toolbar area while the wall is up (z-40 > toolbar z-10; its own controls never misrouted) — transient, higher-priority by design.
- `pointerId` absent → slop logic degrades safely to plain tap-accept (jsdom-verified).

## Next
Re-capture on this build (phone 390x844 + `isMobile`/`hasTouch` so `(pointer:coarse)` matches): tap-accept on camera (touch tap, NOT Tab), wall banner + re-entry inside old 60s window + dismiss-no-bounce + 44px measurements, flush-close probe in a FRESH context (server copy the only possible source), 422 backstop force-render (staged registry flag, disclosed). Clean ch `10334dac` probe prose through the editor first. Then **P5 re-judge v6** (3-panel blind Fable).
