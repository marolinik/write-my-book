# P6 "Owen" re-judge v2 — AGGREGATE (3-judge blind Fable panel, 2026-07-27)

## Verdict: **6.5 UNANIMOUS (UP from 6.0)** — old D4 floor CLEARED

| Dim | A | B | C | Median |
|---|---|---|---|---|
| D1 Functionality | 7.0 | 7.0 | 7.0 | **7.0** |
| D2 Reliability | 7.0 | 7.0 | 7.0 | **7.0** |
| D3 Usability | 7.0 | 6.5 | 6.5 | **6.5** |
| D4 Onboarding | 6.5 | 7.0 | 6.5 | **6.5** |
| D5 Performance feel | 6.5 | 6.5 | 6.5 | **6.5** |
| D7 Trust & safety | 7.0 | 7.0 | 7.0 | **7.0** |
| D8 Manuscript intel | 7.5 | 7.5 | 7.5 | **7.5** |
| D10 Delight | 8.0 | 8.0 | 8.0 | **8.0** |
| D11 Competitive edge | 7.5 | 7.5 | 7.5 | **7.5** |

## Floor consensus: **6.5 plateau across D3 / D4 / D5**
- D4 old driver (D-35 wizard wall) closed on camera by all 3 judges; judge C independently source-verified banner-gating (`page.tsx:467-499` renders Start-Setup banner only when `setupComplete` false; 41e shows none) — closure holds beyond disclosed circularity.
- Residual D4 cap: Skip-only walk, time-to-first-word never measured, "Start Writing!" lands on overview not Chapter 1 editor, import leg unexercised.
- D5 = pure evidence absence for P6 (no stream cadence/latency capture ever) atop baseline 157.2s blocking discuss POST, unre-probed (judge B principal floor).
- D3 = completion invisible in chrome + counter contradictions (all 3).

## Evidence-integrity note
**41c is a pre-setup or stale/mid-hydration frame** (shows Start-Setup banner that only renders when setupComplete=false; generic breadcrumb; missing book-nav; Memory skeleton). "Post-setup overview clean" claim is proven by 41e, NOT 41c. Capture doc should be corrected; 41d opus row below fold (aggregate-corroborated only).

## NEW defects registered (next free was D-160)
- **D-160 (S3, all 3 judges):** setup completion invisible in UI — sidebar "Getting Started 0/2" pixel-identical pre/post wizard, Setup never checked, "Start Setup" nag + "Style Next Step" badge persist after setupComplete=true; counter contradiction 2/6 (wizard) vs 2/5 (banner) vs 0/2 (sidebar).
- **D-161 (S3, judge C):** "Start Writing!" CTA lands on book overview, not Chapter 1 editor — extra locate-row+Edit hop between CTA and first word; breaks D4 "typing ≤60s" promise.
- **D-162 (S4, judges B+C, D-44 family):** Usage-by-Agent Ghost Text row "664 in / 4.0K out" — output 6× input, ~166 input tok/session implausibly low for context-fed completions; suspect in/out column swap or input undercount in registry rollup. One DB read on usage_records settles it.
- **D-163 (S4, judges A+B):** "1 chapters" pluralization ×2 (41a helper, 41b Done summary) — 7-locale product.
- Recurrence note (no new number): FAB occludes chapters Action column in 41e — D-139 family.
- **Next free: D-164** (pending P1 panel registrations).

## Next-action consensus (floor lever)
One timed on-camera editorial/onboarding leg, scratch book: wizard "Capture My Writing Style" OR Done→Start Writing→Chapter 1→first words with wall-clock + stream cadence, ideally with `modelEditor: anthropic/opus` set to prove D-43 live. Any variant attacks the D3/D4/D5 plateau simultaneously; judges A and C both project 7.0 on success.

Raw verdicts: `p6-v2-raw-verdicts.md`. Bundle: `p6-v2-judge-bundle.md`. Prior: HELD-REJUDGE-AGGREGATE.md P6 6.0.
