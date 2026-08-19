# P5 v4 re-capture — D-116..D-119 live proof (2026-07-21)

Proves the seeded-reasoning quick-assist floor (P5 = 4.5) is closed by fix
`d51514c`. Live HTTP against dev server :3002, acting as Sam via
`x-e2e-clerk-id: user_qa_p5`.

## Setup (verified live)
- Sam = `user_qa_p5` (id `d68c3b5e-…`), **`default_model = openrouter-qwen36/sonnet`** (the exact seeded reasoning default that caused D-116/D-117).
- Validated OpenRouter key present; unsubscribed → free tier.
- Book `35ff1112-52af-4001-a0f4-ec83f4dad9b0` (en).
- Server ran the in-place fix since 07-20; fix committed+pushed `d51514c`.

## Results

### D-116 — ghost-text (was 100% honest 422, no suggestion possible)
| call | HTTP | time | suggestion | usage model | out tok |
|------|------|------|-----------|-------------|---------|
| cold #1 | 200 | 12.6s | "darkness, the weight of his footsteps echoing like the memory of all the years he had ascended them." | openrouter-deepseek/haiku | ~19 |
| warm #2 | 200 | **1.99s** | "read, her fingers trembling against the damp paper and the words blurring in the candlelight." | openrouter-deepseek/haiku | 19 |

Ghost-text now returns real prose (200), seconds-fast warm. Pre-fix: never any text — reasoning model burned the 60-tok budget on thinking → 422 every time.

### D-117 — inline-edit (was 28–44s, 1655–3464 thinking tokens)
| call | HTTP | time | out tok | model |
|------|------|------|---------|-------|
| post-fix (mine) | 200 | 9.5s | **98** | openrouter-deepseek/haiku |

3 real rewrite suggestions returned. `tokensUsed` from response: input 223 / **output 98**.

### The flip, captured in `usage_records` (ordered by recorded_at)
| time | surface | model | out tok |
|------|---------|-------|---------|
| 07-20 13:22:41 | inline-edit | **openrouter-qwen36/haiku** | **1655** |
| 07-20 13:23:25 | inline-edit | **openrouter-qwen36/haiku** | **3464** |
| 07-20 13:26:46 | ghost-text | openrouter-deepseek/haiku | 25 |
| 07-20 13:26:48 | inline-edit | openrouter-deepseek/haiku | 77 |
| 07-21 08:26:04 | ghost-text | openrouter-deepseek/haiku | 22 |
| 07-21 08:26:53 | inline-edit | openrouter-deepseek/haiku | 98 |
| 07-21 08:26:56 | ghost-text | openrouter-deepseek/haiku | 19 |

Pre-fix qwen36 reasoning output 1655/3464 → post-fix deepseek output 19–98.
~17–35× fewer output tokens; DeepSeek $0.40/M vs qwen `$$` tier ⇒ the claimed
~50–90× cost drop. `model` column still stores the resolved registry id
(D-44 provider-attribution contract intact).

### D-119 — usage record still stores registry id
`usage_records.model = openrouter-deepseek/haiku` (raw slot id preserved for
attribution); display transform `formatUsageModelLabel` renders the
writer-facing name at the billing panel only.

### Free-tier ghost meter (+1 on success)
`free_tier_usage` for Sam `2026-07-21`: **ghost_text_calls=2, inline_edit_calls=1**
— increments only on billable success (D-36 lesson), Sam correctly on free tier.

## Acceptance verdict (from plan)
1. Sam ghost-text → 200 suggestion, seconds-fast (warm 1.99s), usage written (deepseek), meter +1 → **PASS**
2. Inline-edit → 200, fast, output 98 tok vs pre-fix 1655–3464 (1–2 orders lower) → **PASS**
3. Thinking-only 422 ONLY where warranted — Sam's fixed path no longer 422s (D-116 over-fire gone); honest 422 backstop retained (unit-tested `quick-assist-routes.test.ts`) → **PASS**

**P5 seeded-reasoning floor (D-116/D-117/D-118/D-119) closed live. Ready for P5 v4 re-judge.**
