# P5 "Sam" — Free-tier on-ramp — RE-JUDGE v3 journey log

**Run:** 2026-07-20 · LIVE `http://localhost:3002` · persona **Sam** (`user_qa_p5`,
`plan:null` UNSUBSCRIBED, phone-first budget writer). Committed code is LIVE
(tree clean, D-100 fix landed `26c57c9`). Evidence-only — **no `src/` edits**.
Secrets read from `process.env` via `npx tsx --env-file=.env`; **never printed**
(E2E secret shown only masked `test-se…cret`; OpenRouter key referenced by
provider + length only). **One worker** throughout (`worker-proof.txt`, leaf
PID 61892).

Auth at the network layer: `x-e2e-test-secret` (`process.env.E2E_TEST_SECRET`)
+ `x-e2e-clerk-id: user_qa_p5`.

---

## 0. Environment / baseline (`01-db-baseline.json`, `worker-proof.txt`)
- **One worker** (leaf PID 61892, created 2026-07-20 11:04). Dev web server
  restarted since v2 (start-server.js **PID 53220, created 11:40:39** — *after*
  the D-100 fix landed), which is what closes D-99.
- Sam: Free (`subscription = null`), `default_model = openrouter-qwen36/sonnet`
  (→ resolves to `qwen/qwen3.6-27b`, **the reasoning model / D-100 case**), one
  **validated OpenRouter** key (len 212, value never printed).
- 1 book `35ff1112-…` "Sam Free-Tier On-Ramp QA 2026-07-20", 1 chapter
  `10334dac-…` (32 words). `free_tier_usage` row **absent** for today (clean
  meter). `usage_records` = 1 (an `embedding`, **no** ghost/inline history) → the
  ghost/inline billing baseline is **0**.

## 1. D-99 re-check — billing honesty is LIVE (`10-billing-before.json`)
`GET /api/billing/subscription` → **200** with the full Free snapshot
`freeTier {sessionsUsed:0/20, ghostUsedToday:0, inlineUsedToday:0,
aiWordsUsed:32/40000}`. In v2 this was **500** (stale globalThis Prisma client on
an un-restarted server). The web-server restart picked up the `FreeTierUsage`
client → **D-99 CLOSED**.

## 2. D-100 re-test — ghost-text ×6 + inline-edit ×4 on the reasoning default
(`20-ghost-1..6.json`, `21-inline-1..4.json`, `_d100-classification.json`)

Founder acceptance: each attempt must end in **(a)** a real usable 200 suggestion
**OR (b)** HTTP **422 `MODEL_NO_QUICK_SUGGEST`** with plain-language copy. FAIL on
the old generic **502 "cut off"**, a hang, or an empty-200.

| Attempt | Result | Detail |
|---|---|---|
| ghost ×6 | **422 `MODEL_NO_QUICK_SUGGEST`** (all 6) — **PASS (b)** | copy: *"This model only returns internal reasoning, so it can't produce quick inline suggestions. Choose a different model for inline assist in Settings."* 1.2–3.8 s each |
| inline ×4 | **200 real suggestions** (all 4) — **PASS (a)** | e.g. `[Tighter pacing] Three days of unbroken rain.` / `[More sensory] Cold rain drummed against the glass…` 28.6–44.3 s each |

**Distribution: 6× PASS-b-422, 4× PASS-a-REAL. Zero 502 / zero hang /
zero empty-200.** The old floor-driver (retryable 502 "cut off" loop) is **GONE**.
Mixed a/b is the explicitly-acceptable outcome. **D-100 CLOSED.**

Why mixed: at the 60-token ghost budget `qwen/qwen3.6-27b` still emits
thinking-only blocks *even with the OpenRouter `reasoning:{enabled:false}`
directive attached* → the route's honest 422 fires. At the 4096-token inline
budget there is room for text after the reasoning, so real JSON rewrites come
back 200. (Latency is high — see defects.md.)

## 3. Billing honesty on the 422 path (`30-billing-after.json`, `50-db-after-d100.json`)
- `freeTier` meter **before → after**: `ghostUsedToday 0 → 0` (6 ghost 422s
  advanced it by **zero**), `inlineUsedToday 0 → 4` (4 genuine 200s each billed).
- DB: `free_tier_usage {ghost_text_calls:0, inline_edit_calls:4}`; `usage_records`
  gained **exactly 4 `inline-edit` rows** (model `openrouter-qwen36/haiku`, real
  tokens+cost) and **0 `ghost-text` rows**. **The 422 path writes no usage record
  and does not move the meter. Genuine 200s bill normally.** ✔

## 4. Escape hatch — switch to a non-reasoning model via the settings route
(`60..70-*.json`, `_escape-hatch-summary.json`)
`PATCH /api/settings/default-model {defaultModel:"openrouter-deepseek/sonnet"}`
→ 200. Re-fire on **DeepSeek V3.2** (non-reasoning, on the same OpenRouter key):
- ghost-text → **200 real**: *"just beginning to rage, and in that moment he felt
  the weight of his solitude settle upon him like the cold Atlantic mist."* (6.9 s)
- inline-edit → **200 real**, 3 usable rewrites (2.6 s).

Then restored `defaultModel = openrouter-qwen36/sonnet` and verified
(`70-verify-restored.json`) — **account left as found**. The 422 copy's advice
("choose a different model in Settings") is **actionable and correct**: a
one-setting change turns the dead ghost-text surface into working, *fast*
suggestions.

## 5. D-101 re-check (`80-env-flags.json`, `81/82/83-*.json`)
`DEV_AUTH_BYPASS="true"` (NODE_ENV unset/dev). Header-less `GET /api/books` → **200**
returning the **DEV user's** books (`4611e6b9-…`, "The Salt Letters" etc.) — **not
Sam's** (`d68c3b5e-…`). No-auth billing → 200 (dev user); wrong-secret billing →
200 (falls through to dev user). So the **401 negative control is unprovable in
this dev env** (same as v2). This is **dev-only** (`NODE_ENV!=="production"`-gated),
**latent S1 only if the flag ever reaches a non-dev deploy**. It is dev-user
self-data via the bypass, **not** a cross-tenant leak from Sam. **D-101 STILL-OPEN
(out of dev scope — declared, not faked).**

## 6. Value sweep — core loop D11/D5/D3 (`90..96-*.json`)
- **Write → save → confirm:** `GET content` (v1) → `PUT content` with
  `expectedVersion:1` → **200 {wordCount:52, version:2}** → `GET content` confirms
  v2 + persisted prose. Optimistic-lock CAS (D-47) round-trips cleanly.
- **Quick assist accept/reject:** genuine 200 suggestions (inline qwen §2, ghost+inline
  deepseek §4) are usable text the editor can apply; the qwen ghost path returns
  an honest, actionable 422 card instead of a suggestion (see §2).
- **Adversarial envelopes:** malformed JSON → **400** `Invalid JSON in request
  body`; oversized inline selection (10 001 ch) → **400** `Invalid input`;
  oversized ghost context (2 001 ch) → **400** `Invalid input`. No 500s.
- **Export:** `POST …/export {docx}` → **200**, real intact file
  `Sam-Free-Tier-On-Ramp-QA-…-.docx` (wordCount 116, chapterCount 1, pages 6,
  warnings []). Export ungated for Free Sam. ✔

## Final state (`99-db-final.json`)
`default_model` restored to `openrouter-qwen36/sonnet`; 1 book / 1 chapter (52
words, save persisted); `free_tier_usage {ghost_text_calls:1, inline_edit_calls:5}`
= exactly the 6 genuine successes (4 qwen inline + 1 deepseek ghost + 1 deepseek
inline); the 6 qwen ghost 422s billed nothing. Bundle secret-scan clean.
