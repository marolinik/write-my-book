# P5 evidence bundle — BLIND SCORING (v4)

Score this persona on the 12-dimension rubric below. Judge ONLY from the
evidence in THIS file. Do not read any other file or explore any repository.
All measurements are on a **dev server** (label everything dev-server). The
model under test is a seeded reasoning model (`qwen3.6-27b` family) as the
persona's default; "cheap model" below = a non-reasoning DeepSeek model.

## Persona
**Sam** — phone-first hobbyist novelist. Brings his own OpenRouter API key
(BYOK). Unsubscribed → **free tier** (daily quick-assist meters apply). His
account's **default model is a reasoning model** (seeded). He writes primarily
on a phone. Two "quick-assist" surfaces matter to him:
- **ghost-text** = inline autocomplete continuation as he types (60-token budget).
- **inline-edit** = rewrite a selected sentence into N alternatives.

## Evidence A — prior audit of this persona (behaviour observed earlier)
1. ghost-text on his default model: **6/6 attempts returned an honest error
   card** ("this model only returns internal reasoning… pick a different model")
   — autocomplete was impossible on the default until he manually switched models.
2. inline-edit on his default model: worked, but **28–44 s per call** and billed
   **1655–3464 output tokens** of invisible "thinking" per call to his own key
   (~50–90× the cost of the same call on the cheap model, which used ~77 tokens).
3. The error copy told him to pick a different model "for inline assist" — but
   inline-edit actually worked on that model; the copy over-scoped the failure.
4. Spend audit labeled his usage under an internal model slug he never selected.
5. **No mobile/browser screenshots were ever captured** for this phone-first
   persona: the 422 error card render, the loading state during 28–44 s waits,
   and the settings click-path are all unphotographed.
6. Never exercised: free-tier **cap exhaustion** (the wall behaviour — his core
   fear), **cross-tenant** access under valid auth, stale-version **409** on save,
   **docx export** bytes, **provider-outage** path.

## Evidence B — fresh live capture (this build, over real HTTP as Sam, dev-server)
Quick-assist calls on his **unchanged default** (the seeded reasoning model):

| surface | HTTP | wall time | result | billed model | output tokens |
|---|---|---|---|---|---|
| ghost-text (cold) | 200 | 12.6 s | real prose continuation returned | cheap DeepSeek | ~19 |
| ghost-text (warm) | 200 | **1.99 s** | real prose continuation returned | cheap DeepSeek | 19 |
| inline-edit | 200 | 9.5 s | 3 real rewrite alternatives returned | cheap DeepSeek | 98 |

`usage_records` for this persona, in time order:
```
07-20 13:22  inline-edit  reasoning-model   out=1655   (prior behaviour)
07-20 13:23  inline-edit  reasoning-model   out=3464   (prior behaviour)
07-20 13:26  inline-edit  cheap-DeepSeek    out=77
07-21 08:26  inline-edit  cheap-DeepSeek    out=98
07-21 08:26  ghost-text   cheap-DeepSeek    out=19
```
- Spend is now attributed to the resolved cheap model id; the raw internal id is
  still what's stored (a transform renders a friendlier name only on the billing
  screen — not captured here).
- Free-tier daily meter incremented **only on the successful 200 calls**
  (ghost_text_calls +2, inline_edit_calls +1 for the day); refusals bill nothing.
- The honest error card still exists as a backstop for models that genuinely
  return only reasoning; on Sam's default it **no longer fires** (now 200).

### What Evidence B does NOT contain (still missing)
- No phone browser render of ghost text appearing as he types; no screenshot of
  any state; these are non-streaming endpoints (latency is whole-response, no
  first-token/inter-token cadence captured).
- No cap-exhaustion, no cross-tenant probe, no 409/docx/provider-outage.
- D3b (ergonomy), D6 (look & feel) have no visual evidence at all.

## Rubric — 12 dimensions (score each 0–10 or NO-EVIDENCE)
| # | Dimension | Weight |
|---|---|---|
| D1 | Functionality — journeys complete correctly | 2.0 |
| D2 | Reliability & data safety — words never lost | 2.0 |
| D3 | Usability — state visibility, control, plain-language errors | 1.5 |
| D3b | Ergonomy & efficiency — click/keystroke economy, no dead-ends | 1.0 |
| D4 | Onboarding / time-to-first-word | 1.0 |
| D5 | Performance feel — latency, first-token, stream cadence, queue honesty | 1.0 |
| D6 | Look & feel / design polish — themes, contrast, locale, states | 1.0 |
| D7 | Trust & safety — gates, ownership, key handling, billing states | 1.5 |
| D8 | Manuscript intelligence quality — voice, anchoring, continuity | 2.0 |
| D9 | Retention / habit | 1.0 |
| D10 | Delight — moments that exceed expectation (ghost text, "magic") | 0.5 |
| D11 | Competitive edge vs incumbent; "would switch & pay" | 1.5 |

## Calibration anchors
- 6 — works but feels like an internal tool; frequent friction.
- 7 — good SaaS baseline; occasional rough edge.
- 8 — polished; a paying author is satisfied; rare friction.
- 9 — genuine peer to best-in-class with a real moat; friction is rare/memorable.
- 9.5 — best-in-class; testers try to break it and fail.
- 10 — reserved; do not award.

## Severity for any new defects
S1 data-loss/billing-overrun/leak/ownership-bypass/crash · S2 journey-block/wrong
output · S3 friction/polish capping a dim · S4 cosmetic.

## Your task
Score EVERY dimension you have evidence for; mark **NO-EVIDENCE** (excluded, not
a low score) where the bundle gives you nothing. For each score cite the specific
evidence line. Explicitly answer: *does this bundle look suspiciously clean, and
what failure evidence would you expect that is missing?* End with a one-line
headline grade = the lowest dimension you scored, and name that flooring dim.
