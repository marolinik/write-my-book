# D-127 / D-129 / D-130 / D-131 fix lane — quick-assist honesty + D5 loading
2026-07-26 · branch `qa/bulletproof-2026-07-17` · commits `bdb45c1` (fix lane) + refinement commit (this one's parent log)
Method: TDD RED-first → 3-lens adversarial review (Fable-orchestrated, wf_401121f1-44b, 22 agents, 19 confirmed / 0 refuted, none critical) → opus refinement wave (wf_831d5262-d91, 3 executors) → Fable verify (suite + tsc + diff review).

## What landed

| Defect | Fix | Where |
|---|---|---|
| **D-129 (S2)** | Ghost client toasts server error copy: 429 wall (throttled per-message 60s, **Upgrade → /settings/billing** action), 422 `MODEL_NO_QUICK_SUGGEST` (**Open Settings → /settings** action — first-ever client consumer of the code), 5xx/network fallback copy. Abort during error-body read stays silent. Inline popup renders `role=alert` server copy, stays retryable, reports zero-suggestions case. | `ai-ghost-text.tsx`, `inline-edit-popup.tsx`, new `quick-assist-client-errors.ts` |
| **D-130 (S3)** | `joinGhostSuggestion(before2ch, suggestion)` — space-join on Tab accept; punctuation/bracket aware; quote disambiguation via 2-char context (apostrophe/open-quote glues, closing-quote-after-punctuation spaces; straight `'` binds left). | new `ghost-text-join.ts` + Tab handler `textBetween(from-2, from)` |
| **D-131 (S3)** | `buildModelGroups(providers, selectedId)` — displayName dedupe keeps the selected id's family entry (in place); picker memo depends on `value`. Render test proves trigger shows "Qwen 3.6 27B (OpenRouter)" for stored sonnet id (blank-trigger symptom dead). | new `model-picker-groups.ts`, `model-picker.tsx`, `model-picker-render.test.tsx` |
| **D-127** | Point-of-use disclosure "Quick suggestions may use a faster model than your default." — inline popup instruction phase, ghost-toggle dropdown item, desktop ghost ToolbarButton tooltip (second muted line; aria-label unchanged). | `inline-edit-popup.tsx`, `editor-toolbar.tsx` |
| **D5 fold-in** | Pulsing `role=status` dots at cursor while ghost fetch in flight; repositions on scroll/resize; selection move during flight aborts the request (no stale-position render). | `ai-ghost-text.tsx` |

Tests: 6 files, 46 tests total for this lane (32 RED-first + 14 refinement). Suite **1297/1297**, tsc 0.

## Review panel → refinement disposition
19 confirmed findings (2 HIGH — both test gaps — 4 MEDIUM, 13 LOW). All HIGH/MEDIUM and 5 LOW fixed in the refinement wave: abort recheck, straight-apostrophe + curly-quote join blind spots, pending reposition/dismiss coverage, per-message throttle (alternating-copies re-toast), upgradeToTier action, desktop tooltip disclosure, coherent `textBetween` stub asserting the `(from-2, from)` range, D5 indicator tests, cooldown-vs-forever-silent distinction, picker render pin (verified to bite on a bogus id), non-Error rejection fallback.

## Accepted residuals (logged, not fixed)
- **Mid-word completion tradeoff**: 1-char/2-char heuristic can't distinguish "the"+"dream" (space wanted) from "thr"+"ough" (glue wanted). Capture evidence shows the glue direction is the live failure; completions of partial words are rare under the "continue mid-sentence" prompt. Revisit only if re-shoot shows corruption.
- **D-131 family reachability**: while a lower-tier id is stored, the family's other tier ids have no SelectItem (identical displayName — user couldn't distinguish them anyway). Proper fix = displayName tier disambiguation. Design-memo candidate, D-108/D-109 pile.
- **Toolbar disclosure markup untested** (tooltip/dropdown need Radix open-state in jsdom); phone re-shoot covers visually.
- **Popup position-gate negatives** (auto-submit `from===to` close path) untested — LOW.

## Next
Re-shoot on this build: 09 wall moment (visible 429 toast + Upgrade action), ghost render + loading dots + Tab join, 12 picker showing stored default, 422 backstop toast if forceable. Then **P5 re-judge v5** (3-panel blind Fable).
