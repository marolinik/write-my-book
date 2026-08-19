# P6 Owen — UI capture wave 2026-07-26 (D4 floor evidence)

**Build:** `1f6d7f8` head (fixes under test shipped long ago: D-35 `48169ec`/`dc912fa`) · Dev :3001, identity via e2e headers (`x-e2e-clerk-id: user_qa_p6`), desktop 1280x900, v8 protocol (nextjs-portal hidden).

The held-rejudge D4 floor said: "wizard fixed, no UI capture — onboarding surfaces unassessable." This wave supplies the missing pixels.

| Shot | Proves |
|---|---|
| `41a-p6-setup-wizard-entry.png` | Setup wizard live: "Book Setup — 2/6 steps done" with the full step rail (Basics / Import / Style / Story Bible / Architecture / Done), per-step CTAs + Skip. |
| `41b-p6-setup-finished.png` | Walked Basics→Done via per-step Skip; Done step renders "Start Writing!". |
| `41e-p6-start-writing-landed.png` | **D-35 CLOSED on camera**: "Start Writing!" click navigates to the book overview (no bounce-back) and `GET /settings` returns **`setupComplete: true`** — the persistence that pre-fix was silently dropped. |
| `41c-p6-post-setup-overview.png` | **CORRECTED 2026-07-27 (v2 panel evidence-integrity note accepted):** this is a **pre-setup / mid-hydration frame**, not post-setup — it shows the Start-Setup banner, which renders only when `setupComplete === false`, plus a generic breadcrumb and a Memory skeleton. The "post-setup overview clean" claim is proven by **`41e`**, not `41c`. Superseded as the post-setup overview frame by `45a-p6-setup-complete-chrome.png` (see `UI-CAPTURE-2026-07-27.md`), which also shows the residual `Recommended: Capture Style` solicitation neither 41c nor 41e was read for (D-173). |
| `41d-p6-byok-usage-panel.png` | **D-44 surface in pixels (D7 adjacent)**: Usage by Agent — Writing Coach 17 sessions **$10.63** (1.3M in / 115.2K out — the Anthropic Opus BYOK spend), Ghost Text $0.01; Usage by Model with true registry ids (qwen/qwen3.6-27b $0.43, claude-opus-4-*…). Real non-zero per-key spend, not $0. |

Staging/harness notes: wizard exercised on the 0-word "VM1 Test" scratch book (`8632ba0c`) with `setupComplete` reset to false via the D-35 PATCH itself (200) — **"The Keeper's Arithmetic" and its pre-registered ch5 device probe were NOT touched**; no persona re-seed (destructive per scout); Indie 2-book cap hit live (403 with honest copy + upgradeToTier) when a scratch create was attempted — kept as bonus honest-wall evidence.
