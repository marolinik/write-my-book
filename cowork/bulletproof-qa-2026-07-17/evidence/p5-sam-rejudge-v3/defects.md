# P5 Sam — Re-judge v3 defects (evidence-only, live-driven 2026-07-20)

> **v3 mission:** re-test the landed **D-100** fix on Sam's seeded reasoning
> default, prove billing honesty on the 422 path, verify the escape hatch, and
> re-check baseline drivers (D-99, D-101) + the core value loop. Evidence-only;
> **no `src/` edits.** Raw traces in `api-traces/`, harness in `scripts/`.
> Secrets read from `process.env` via `--env-file=.env`, **never printed**.

Severity scale (campaign): S1 data-loss/overcharge/leak/bypass/crash · S2
journey-blocking/fabricated-output/false-positive · S3 friction · S4 cosmetic.

---

## Baseline-driver verdicts (the P5 floor)

| ID | Was | Now | Verdict | Proof |
|---|---|---|---|---|
| **D-100** (S2 floor driver) — reasoning default → 502 "cut off" empty-retry loop | 502 retryable, never a suggestion, no honest signal | ghost ×6 → **422 `MODEL_NO_QUICK_SUGGEST`** (honest, actionable, no bill); inline ×4 → **200 real**; **zero 502/hang/empty-200** | **CLOSED** | `20-ghost-1..6.json`, `21-inline-1..4.json`, `_d100-classification.json` |
| **D-99** (env) — stale globalThis Prisma client → billing/AI 500 on un-restarted server | 500 live | `GET /api/billing/subscription` → **200** + full freeTier snapshot | **CLOSED** | `10-billing-before.json`, `30-billing-after.json` |
| **D-101** (dev-only, latent S1-if-prod) — `DEV_AUTH_BYPASS` masks the no-auth 401 control | header-less → dev user's data | `DEV_AUTH_BYPASS="true"`; header-less `GET /api/books` → **200** dev-user books (not Sam's); 401 control unprovable here | **STILL-OPEN** (out of dev scope; declared, not faked) | `80-env-flags.json`, `81/82/83-*.json` |

**Billing honesty on the 422 path (founder ask):** proven. 6 ghost 422s wrote
**0** usage records and left `ghost_text_calls:0`; 4 genuine inline 200s wrote 4
`inline-edit` records and set `inline_edit_calls:4`. Genuine suggestions bill
normally; refusals bill nothing. Proof: `50-db-after-d100.json`, `99-db-final.json`.

---

## New observations (provisional — record RAW, do not fix)

Both are **within the founder's D-100 acceptance** (the honest 422 is a valid
terminal outcome), so neither reopens D-100 as S2. They are recorded as the
**residual friction that now bounds P5** once the 502 loop is gone.

### TBD-A (S3) — the seeded Free default (`qwen/qwen3.6-27b`) can **never** return a ghost-text suggestion; the reasoning-disable directive is ineffective at the 60-token ghost budget
- The routes attach OpenRouter `reasoning:{enabled:false}` on the openrouter
  route (`src/lib/llm/quick-assist.ts`), yet **all 6** ghost-text attempts at
  `max_tokens:60` still came back thinking-only → **422** every time
  (`20-ghost-1..6.json`). Inline-edit at `max_tokens:4096` works because there is
  budget for text after the reasoning. DeepSeek (non-reasoning) returns ghost
  text at 60 tokens in 6.9 s (`61-ghost-1-*.json`).
- **User-facing truth:** for the on-ramp persona whose seeded default *is* this
  model, the flagship "ghost text as you type" surface is a **100 % honest error
  card**, never a suggestion, until the writer manually switches models. The copy
  is correct and actionable (and the escape hatch works in one setting change),
  so this is **friction, not a blocker or a lie** — but the *first taste* of the
  headline inline feature is still an error, driven by a **model-seeding choice**
  (why seed a reasoning model as the Free default when it can't do half the
  quick-assist surface, and the disable directive doesn't take at the ghost
  budget?). Fix candidates for judges: seed a non-reasoning Free default; or
  enforce a real reasoning-suppression / min-text-budget for the ghost path.
- Proof: `20-ghost-1..6.json`, `_d100-classification.json`, `61-ghost-1-openrouter-deepseek-sonnet.json`.

### TBD-B (S3) — inline-edit on the seeded reasoning default is **28–44 s** for a "quick" assist (no streaming / budget guard)
- The 4 genuine inline 200s took **28.6 / 34.9 / 29.8 / 44.3 s**
  (`21-inline-1..4.json`). The same inline-edit on DeepSeek (non-reasoning) took
  **2.6 s** (`62-inline-1-*.json`). The reasoning model spends most of the 4096
  output budget thinking before emitting the JSON, and there is no streaming or
  latency guard on this "quick" surface.
- **User-facing truth:** on a phone, a budget writer waiting 30–44 s for three
  rewrites will read it as a hang and bounce — the result is real and honestly
  billed, but the wait undermines the "quick assist" promise. **S3 friction.**
- Proof: `21-inline-1..4.json`, `62-inline-1-openrouter-deepseek-sonnet.json`.

---

## Explicitly NOT filed / caveats (so judges don't misread)
- **Mixed ghost-422 / inline-200 is NOT a D-100 failure** — the founder ruling
  makes 422 `MODEL_NO_QUICK_SUGGEST` a valid terminal outcome; both paths avoid
  the old 502, hangs, empty-200s, fabrication, and mis-billing.
- **D-101 "no-auth → 200" is NOT a code regression** — it is the `DEV_AUTH_BYPASS`
  env returning the dev user's *own* data; the route auth code is unchanged and
  no cross-tenant data crossed into Sam's session.
- **Adversarial 400s are correct** — malformed JSON and oversized inputs return
  clean `{error}` 400 envelopes, no 500s (`40/41/42-*.json`).
- **Export ungated** for Free Sam (`95-export-docx.json`) — matches the published
  "export is never gated" promise.
