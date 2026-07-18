# W6 — Stripe billing lifecycle (gap-fill)

Non-LLM, API-level. Evidence-only. Raw run data in `_results.json`; full step-by-step
transcript (request/response pairs, DB snapshots) in `api-traces/w6-lifecycle-steps.json`.

## Scope note — what Rita (P8) already covered vs. this gap-fill

Read in full before starting: `evidence/p8-rita/journey-log.md`, `evidence/p8-rita/defects.md`,
and `FLAGSHIP-ADDENDUM.md` §W6 (lines 61-67).

**Finding: Rita's executed journey contains zero Stripe/billing-lifecycle testing.** Her actual
scope (confirmed by full read of journey-log.md + defects.md) was: cross-tenant ownership
fencing (15/15 probes), tier-gate DENY proofs (gate-01..09 — access control given an
*already-seeded* plan, not a plan *transitioning*), prompt-injection containment, rate-limit
enforcement, input validation (source of D-01), key confidentiality, and health-probe honesty.
Neither "stripe", "webhook", "checkout", "proration", "dunning", nor "billing portal" appears
anywhere in her evidence.

One loose thread worth flagging: `scripts/qa-seed-personas.ts` line 17-18 carries a stale
comment — `"P8 Rita drives billing lifecycle transitions herself during her journey"` — which
suggests the *original design intent* had Rita covering this ground. Her actual executed
journey did not. **Covered-by-Rita list: empty.** Everything below is net-new coverage, not
a redo of her work.

## Method

Two threads, run against the live local stack (PORT 3002, real Postgres, real Stripe
test-mode via CLI-authed keys already in `.env`):

- **Thread A — P2-linked, synthetic signed webhooks.** All 7 webhook event types the handler
  supports were fabricated as Stripe-shaped JSON, signed locally with
  `stripe.webhooks.generateTestHeaderString({payload, secret: STRIPE_WEBHOOK_SECRET})` (no
  network round-trip to Stripe needed to produce a validly-signed event — this is Stripe's own
  documented pattern for webhook-handler testing), and POSTed to `/api/billing/webhook`.
  `customer.subscription.updated`/`.deleted` events used a real Stripe price ID
  (`STRIPE_PRO_MONTHLY_PRICE_ID`) so `planFromPriceId()` was exercised against genuine data,
  not a fabricated key. Events were chained against one fake `stripeSubscriptionId` so the
  later events (which resolve the persona purely via `stripeSubscriptionId` lookup, no
  metadata) prove the *lookup path* works, not just the metadata-passthrough path.
- **Thread B — real Stripe test-mode, throwaway customer.** A disposable customer +
  subscription (`qa-w6-throwaway@test.local`, attached `pm_card_visa`) was created, upgraded,
  and downgraded via the real Stripe API to get Stripe's own proration math — this thread never
  touches any persona's DB row. Canceled + deleted at Stripe when done.

No `src/` edits, no server/worker restart, no LLM job enqueued, no `stripe listen` process left
running (none was started — signing was done locally via the SDK, not via a forwarding
listener).

## Persona isolation

`user_qa_p2` (mine) was the only persona whose DB row was ever mutated, and only via its
`user_id`-scoped subscription row (never `user_qa_p5`, never any other persona). Full snapshot
taken before the first mutation and restored to byte-for-byte the original shape
(`plan=professional, status=active, billing_interval=monthly, stripe_customer_id=NULL,
stripe_subscription_id=NULL, cancel_at_period_end=false`) at the end. All 7 other personas'
subscription rows were re-read after the run and diffed against a pre-run snapshot — **0 bytes
of drift** (`ISOLATION-01`, see `_results.json`).

## Results — 21/21 PASS (19 direct + 2 corrected via harness self-diagnosis, see below)

| ID | Check | Result |
|---|---|---|
| DUP-01 | `POST /billing/checkout` for a *different* plan while already actively subscribed is not blocked at the API | confirmed (see Defects — this is the finding, not a pass/fail of a spec) |
| SIG-01 | Webhook POST with no `stripe-signature` header → 400 | PASS |
| SIG-02 | Webhook POST with a garbage signature → 400, no leak of internals | PASS |
| CHK-01 | `checkout.session.completed` → DB upserts plan/status/customer/subscription id | PASS |
| REPLAY-01 | Same event id replayed with a *different* payload → `deduplicated:true`, DB unchanged (byte-identical `updated_at`) | PASS |
| DUN-01 | `invoice.payment_failed` → status flips to `past_due` | PASS |
| DUN-02 | `create_series` still allowed while `past_due` (Stripe-retry grace period, by design in `plan-gating.ts`) | PASS |
| DUN-03 | `invoice.paid` → status recovers to `active` | PASS |
| CANCEL-01 | `customer.subscription.updated` with `cancel_at_period_end:true` → status stays `active`, flag set, plan intact (real Pro price ID resolved) | PASS |
| CANCEL-02 | Access still allowed after cancel-pending, before period end | PASS |
| CANCEL-03 | `customer.subscription.deleted` (resolved via `stripeSubscriptionId` lookup only, **no metadata** — proves the fallback path, not just the happy path) → status `canceled` | PASS |
| CANCEL-04 | Access denied (403) once actually canceled | PASS |
| PORTAL-01 | Portal call with a customer id that doesn't exist in Stripe → 500, generic message, no Stripe internals leaked | PASS |
| PRORATE-00 | Real throwaway Stripe subscription created (Indie monthly), status `active` | PASS |
| PRORATE-01 | Upgrade Indie(monthly)→Professional(monthly), `proration_behavior:create_prorations` → Stripe computes **-$49.00 credit** (unused Indie) + **+$99.00 charge** (Professional remainder) | PASS (see harness note below) |
| PRORATE-02 | Webhook accepts the real post-upgrade Stripe subscription object shape, 200, no crash | PASS |
| PRORATE-03 | Downgrade Professional(monthly)→Indie(**annual**) (plan + interval change together), `create_prorations` → Stripe computes **-$99.00 credit** + **+$490.00 charge** (full annual, correctly netted against the monthly credit) | PASS (see harness note below) |
| PORTAL-02 | Billing-portal round-trip with a *real* Stripe customer id → genuine `https://billing.stripe.com/p/session/...` URL returned | PASS |
| CLEANUP-01 | Throwaway Stripe subscription + customer deleted | PASS |
| RESTORE-01 | P2 subscription restored to exact original snapshot | PASS |
| ISOLATION-01 | All 7 other personas' subscription rows byte-identical before/after | PASS |

### Harness self-correction (transparency note, not a product defect)

The first harness run inspected proration with `stripe.invoices.list({subscription})`, which
returned **zero** proration lines for both PRORATE-01 and PRORATE-03 — briefly looked like a
real defect (Stripe not prorating). Before filing it, re-checked with the correct API: a
subscription-item price swap with `proration_behavior: 'create_prorations'` attaches **pending
invoice items** to the customer (not a finalized `Invoice` object) until the next billing
cycle — the right calls are `stripe.invoiceItems.list({customer, pending:true})` or
`stripe.invoices.createPreview({customer, subscription})`. Re-ran both transitions on two fresh,
fully-disposed throwaway customers with the corrected inspection call — both surfaced correct,
self-consistent proration lines (`prorationLines` payload embedded in `_results.json` /
`api-traces/w6-lifecycle-steps.json`). This was a test-harness gap, not a Stripe/product one —
recorded here per the campaign's transparency norm (mirrors the P7 pdf/epub self-corrections).

## Final Tally

7 setup/snapshot steps + 21 assertions. **21/21 PASS.** 2 defects filed (see `defects.md`):
one money-path (S1, duplicate-subscription/double-billing risk on checkout) and one UX-honesty
gap (S2, no in-app signal for `past_due` or pending-cancellation).
