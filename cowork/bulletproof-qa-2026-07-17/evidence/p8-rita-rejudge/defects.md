# P8 "Rita" — REJUDGE Defects

Evidence-only. No `src/` was modified. Raw traces for every entry live in `api-traces/`.
Date: 2026-07-20. Target: LIVE `http://127.0.0.1:3002`, HEAD `afc7f2d`.

---

## Part 1 — Baseline P8 defects, re-tested LIVE

| Baseline defect | What it was | Re-test | Live result | Verdict | Proof |
|---|---|---|---|---|---|
| **D-01** | Malformed JSON body → raw **500** (architectural, ~46 routes) | A1 POST /books, A2 PUT chapter-content, A3 POST findings — all with malformed raw bodies | **400** `{"error":"Invalid JSON in request body"}` on all three | **CLOSED** | `A1_*`, `A2_*`, `A3_*` |
| **D-56 / P8-03** | Batch route validated body **before** ownership fence → non-owner got **400 "Invalid input"** (breaks uniform existence-hiding oracle) | E1 (valid body), E2 (malformed), E3 (invalid `[]`) as non-owner p8; E4 same invalid body as **owner** p1 | non-owner **404** in all 3 cases; owner **400**. Oracle is now uniform. | **CLOSED** | `E1_*`, `E2_*`, `E3_*`, `E4_*` |
| **D-15** | wiki POST/GET/PATCH → raw **500 with empty body** on bad input | F1 `{}`, F2 bad enum, F3 null name, F4 bad GET query, F5b PATCH bad enum against a **real owned row** | **400** with `{"error":"Invalid input","details":{…}}` envelope in every case | **CLOSED** | `F1_*`..`F5b_*` |
| **D-14** | style / style-lens POST → **401 Unauthorized** on wrong-typed field (Prisma validation error misclassified as auth) | G1 fingerprint-as-object, G2 sensoryPriority-as-object | **400** `{"error":"Invalid input"}` (via `legacyRouteErrorResponse`) | **CLOSED** | `G1_*`, `G2_*`, `G3_*` |
| **D-06** | Duplicate checkout for an already-subscribed user → **200 + live Stripe URL** = second parallel subscription (double-bill) | I1 POST /billing/checkout as subscribed p3 | **409** `code:"already_subscribed"`, routed to billing portal — returns **before any Stripe call** | **CLOSED** | `I1_*`, `I2_*` |

### Baseline "confirmed clean" sweeps — re-verified STILL clean

| Area | Re-test | Result |
|---|---|---|
| Cross-tenant ownership (read/write/delete/export/memory-stats IDOR) | B1–B9 (p8 vs p1) + B10 sanity | 9/9 uniform **404** existence-hiding; victim book intact |
| Deep composite-key lens fence (confused deputy) | C1 (attacker's own book × victim's lens id) + C2 sanity | **404**, victim lens survived |
| Tier gates (book cap, series/analytics Pro wall) | D1–D8 | no bypass; honest 403/404; positive controls 201/200 |
| Key confidentiality | H1 (p8 BYOK), H2 (p1) | `maskedKey` only; no `encryptedKey`/plaintext in any payload |
| Health-probe honesty | J1, J2 | real env + 8 real per-dependency latencies (not stubbed) |

---

## Part 2 — New findings this run

### N-1 — [S4 / low, error-hygiene] `GET /api/series/{id}/books` returns 405 with an EMPTY body

**Class:** cosmetic error-hygiene / response-envelope consistency. **Not** a security issue, **not** an ownership leak, **not** a data-integrity issue.

`GET /api/series/0e11c5c1-…/books` (as non-owner p8) returned **405 Method Not Allowed** with a **zero-length body** (no `{error}` envelope). The route (`src/app/api/series/[id]/books/route.ts`) only exports `POST`, so Next.js emits its framework-default 405 before any handler runs.

- **Why it is not a fence problem:** the 405 is method-level and identical for any series id regardless of ownership/existence, so it does not distinguish "yours" from "someone else's" from "doesn't exist" — it leaks nothing an attacker can use. (Every legitimate route on this path, e.g. `POST`, still runs the normal ownership fence.)
- **Why it is worth recording:** it is the one response in this whole sweep that returns an **empty body** instead of the app's standard JSON error envelope — the exact honesty/consistency class the campaign has been closing elsewhere (D-15). A client (or monitoring) gets a bare 405 with nothing actionable.
- **Suggested (not applied):** add a lightweight `405` envelope (or explicit method handlers) so every API response — including method-not-allowed — carries the standard `{error}` shape.

Trace: `api-traces/K2_xtenant-series-books.json` (status 405, bodyLength 0).

### No higher-severity new defects found
All adversarial negatives probed this run — cross-tenant read/write/delete/export, batch-before-fence oracle, cross-user `seriesId` smuggling (K3b → 404), E2E-secret arbitrary-clerkId impersonation (K4 → fixed fallback user, not a victim), over-quota book/series/batch — either fail closed with an honest 4xx or are correct-by-design. No raw 500 on any normal or malformed input. No silent-allow.

---

## Notes on scope not exercised (honest limitations)
- **W6 proration** (the baseline's headline evidence-integrity defect D-45, a *judging* finding about a sibling bundle, not a P8-code defect) was **not** re-run here: it requires live Stripe subscription lifecycle mutations against test customers, out of scope for this fence/gate/oracle-focused capture. Marked NOT-TESTED, not asserted either way.
- **D-06 second leg** (the actual proration on a *legitimate* plan change through the portal) was not exercised — only the double-subscribe **guard** (I1) was, which is the P8-relevant no-bypass property and fires before any Stripe call.
- **Rate-limit discuss cap (D-04 empty-reply honesty)** was not re-run: it requires real LLM spend via the persona's BYOK key and is a D8/manuscript-intelligence concern, outside this run's tier/fence/money focus. NOT-TESTED this run.
- No agent-output or extraction latency was measured; all 34 probes are synchronous gate/fence/validation checks, so none is worker-count-sensitive. Exactly-one-worker is nonetheless proven (`worker-proof.txt`).
