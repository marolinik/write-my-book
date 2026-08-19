# P5 Sam — re-judge v3 aggregate (post-D-100 fix)
2026-07-20 · Blind panel, 3 independent Fable judges (func+reliability / UX+experience / trust+manuscript-intelligence), scoring `evidence/p5-sam-rejudge-v3/` (opus capture on fixed HEAD c599a26, dev server restarted post-fix, one-worker proof PASS, secrets clean). Aggregation per GRADING-PROTOCOL: MIN on D1/D2/D7/D8, median elsewhere, NO-EVIDENCE excluded.

## Verdict

**P5 = 4.5** — up from 3.5 (pre-fix cert). Floored by **D5 = D10 = D11 = 4.5**.

| Dim | FUNC | UX | TRUST | Agg | Rule |
|---|---|---|---|---|---|
| D1 Functionality | 6.0 | 6.0 | 6.0 | **6.0** | MIN |
| D2 Reliability | 7.5 | 7.5 | 7.0 | **7.0** | MIN |
| D3 Usability | 6.0 | 6.0 | 6.5 | 6.0 | med |
| D3b Ergonomy | NO-EV | NO-EV | NO-EV | — | excluded |
| D4 Onboarding | 5.0 | 4.5 | 5.0 | 5.0 | med |
| D5 Perf feel | 4.5 | 4.5 | 4.5 | **4.5 FLOOR** | med |
| D6 Look & feel | NO-EV | NO-EV | NO-EV | — | excluded |
| D7 Trust & safety | 6.5 | 6.5 | 7.5 | **6.5** | MIN |
| D8 Manuscript intel | 7.0 | 6.5 | 6.5 | **6.5** | MIN |
| D9 Retention | 5.5 | 6.0 | 6.0 | 6.0 | med |
| D10 Delight | 4.5 | 5.0 | 4.0 | **4.5 FLOOR** | med |
| D11 Competitive edge | 5.0 | 4.5 | 4.5 | **4.5 FLOOR** | med |

Judge headlines: 4.5 / 4.5 / 4.0. Grade = lowest aggregated dim = **4.5**.

## What the fix bought (capture-verified CLOSED)

- **D-100 CLOSED**: seeded reasoning default qwen/qwen3.6-27b — ghost-text ×6 → honest 422 `MODEL_NO_QUICK_SUGGEST` (plain-language settings pointer); inline-edit ×4 → real 200 suggestions. **Zero 502/hang/empty-200.** Old retryable-502 loop gone.
- **Billing honesty CLOSED**: 6× 422 wrote 0 usage_records, free_tier_usage.ghost_text_calls stayed 0; 4× genuine 200 wrote exactly 4 records with real tokens+cost. Refusals bill nothing.
- **D-99 CLOSED**: billing GET 200 with freeTier snapshot (server restarted post-fix, PID proof).
- **Escape hatch CLOSED**: switch to DeepSeek → ghost 200 (6.9s) + inline 200 (2.6s); default restored. 422 advice is actionable.
- **Value loop CLOSED**: CAS save v1→v2, malformed/oversized → clean 400 envelopes, ungated docx export 200.
- **D-101 STILL-OPEN** (declared, not faked): DEV_AUTH_BYPASS=true voids the 401 negative control in dev.

## What binds now (the new floor cluster — one root cause)

All three 4.5 floors trace to the **seeded reasoning default itself**:
- **D5 4.5**: inline-edit 28.6/34.9/29.8/44.3s for a "quick" assist (thinking burns the 4096 budget), no streaming/latency guard; same call on DeepSeek 2.6s. Phone reads it as a hang.
- **D10 4.5**: flagship "ghost text as you type" first taste = a 100% honest error card on the default (0/6 suggestions until manual model switch).
- **D11 4.5**: moat untasteable on defaults; incumbents give a working first taste out of the box.

## New defects (register IDs assigned)

| ID | Sev | Finding |
|---|---|---|
| **D-116** | S3 | Seeded Free default can NEVER ghost-text: `reasoning:{enabled:false}` ineffective at the 60-token ghost budget on qwen3.6-27b — all 6 attempts thinking-only → 422. Honest but the on-ramp flagship is an error card until manual switch. (capture TBD-A) |
| **D-117** | S3 | Inline-edit on reasoning default: 28–44s latency AND 1655–3464 output tokens (~$0.004–0.008) of invisible thinking billed to the budget persona's own key — ~50–90× per-call cost vs DeepSeek (77 tok, ~$0.00009). Latency + value defect. (capture TBD-B + UX-judge cost finding) |
| **D-118** | S3 | 422 copy internally misleading: says the model "can't produce quick inline suggestions" / pick "a different model for inline assist" — but inline-edit WORKS on that exact model (4× 200 in-bundle). First-taste user will believe inline is dead too. Copy must scope the failure to ghost-text. |
| **D-119** | S4 | usage_records label models by resolved slot ("openrouter-qwen36/haiku") not the user-selected model — spend audit shows names the user never chose. Billing-legibility. |

Judge-noted, unregistered (tracked in register misc): priceDiscrepancies:30 on /api/usage unexplained (S4); export "intact" is metadata-only, wordCount 116 vs 52 unreconciled (S4); DB-probe timestamps 2h off (S4 tooling).

## Evidence gaps bounding the next re-judge (all 3 judges concur)

1. Free-tier **cap-exhaustion** never driven (ghost/inline daily, 20-session, 40k aiWords) — the persona's core fear (402 honesty vs 500 at the wall).
2. Cross-tenant 403/404 probe under valid persona auth (dev-bypass voids the no-auth probes).
3. **Zero UI evidence** for a phone-first persona — 422 card render, loading state during 30–44s waits, settings click-path → D3b/D6 NO-EVIDENCE.
4. Stale-expectedVersion 409 rejection untraced; docx bytes unverified; provider-outage path untried.

## Lift path (feeds GRADE-LIFT-PLAN Wave B)

1. **D-116/D-117 root fix (quality/positioning, founder-adjacent):** seed Free-tier default to a non-reasoning model for quick-assist (or auto-route quick-assist to a non-reasoning cheap model while keeping the user's default for long-form). Lifts D5/D10/D11 together — the whole 4.5 floor cluster.
2. **D-118 copy fix (cheap, immediate):** scope 422 copy to ghost-text.
3. Streaming/latency guard on inline-edit (D5; pairs with D-109 discuss-streaming design lane).
4. Browser-driven mobile capture (D3b/D6 + cap-exhaustion + cross-tenant) → next panel can score the blind dims.
