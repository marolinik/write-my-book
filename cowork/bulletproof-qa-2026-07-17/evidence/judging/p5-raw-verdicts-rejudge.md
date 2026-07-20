# P5 "Sam" — 3 raw blind verdicts (2026-07-20)

Preserved for audit. Full reasoning in the session transcript; per-dim + defects distilled here. Aggregate: `P5-REJUDGE-AGGREGATE.md`.

## Headlines
| Lens | Headline | Floors |
|---|---|---|
| functionality+reliability | 5.0 | D7 5.0 / D10 5.0 / D11 5.0 |
| UX+experience | 4.5 | D7 4.5 / D11 4.5 |
| trust+safety (adversarial) | 3.5 | D2 3.5 / D7 3.5 |

## Per-dimension (func / exp / trust)
D1 6.5/6.0/6.0 · D2 5.5/6.5/**3.5** · D3 6.5/5.0/6.5 · D3b 6.0/6.5/6.0 · D4 7.0/6.0/4.0 · D5 7.0/6.5/6.5 · D6 6.0/5.5/6.5 · D7 5.0/4.5/**3.5** · D8 NO-EV · D9 5.5/5.0/NO-EV · D10 5.0/5.0/5.0 · D11 5.0/4.5/4.0

## Defects raised (union across judges)
- **D-92 (S2, all 3 CONFIRMED byte-level):** billing GET returns 401 to an authenticated Free user (same headers 200/201 elsewhere same second) — a DB 500 (missing `free_tier_usage`) masked as auth failure; ghost-text + inline-edit honest 500s. Trust judge: "the paywall's own View-Plans destination lies about why it failed."
- **D-95 (S2, trust+exp judge-found):** onboarding "WMB never stores or processes your content on our servers" is false — prose persisted server-side (documentId/version) + book `s3Prefix`. Fabricated privacy guarantee on screen 1.
- **J-1/J-3 (all 3, evidence-integrity, S2-vs-bundle):** SUMMARY's "2nd book → 403" + "export never capped" have NO trace — Free-cap negative enforcement asserted, never driven.
- **J-2/J-6 (S3/S4):** "key-less" persona actually has a seeded OpenRouter key visible in settings — narrative contamination + alternate unfalsified cause for AI 500s.
- **Stale chapter counter (S4):** dashboard "Total Chapters 0" vs 1 chapter/32 words.
- **`<html lang>` "en" under FR (S3/S4):** wrong language announced to screen readers; partial FR localization (card metadata untranslated).
- **D-93 (S3):** color-contrast 2.71:1 (dashboard) + heading-order (settings Anthropic card). **D-94 (S3):** landmark-unique + region all screens.
- **"Write My Book OK" (S4):** naming artifact on onboarding screen 1.
- **Jargon-forward (S3):** settings leads with API-keys/BYOK; onboarding step-1 self-contradicts ("no API key required" → "uses your own AI provider API keys").

## "Suspiciously clean?" consensus
Not sanitized — the executor honestly surfaced its own 401/500/missing-table bad news (credible). But systematically incomplete at the adversarial-negative + UI-failure layer: no 2nd-book-403, no export, no no-secret control, no cross-user probe, no rendered failure-state screenshots, no editor capture. And the bundle's own screenshots contain an unfiled falsehood (D-95). Curated toward driver-closure, not toward breaking the product.

## Secrets: PASS (all 3 judges grepped; zero raw-secret hits; auth secret only masked).
