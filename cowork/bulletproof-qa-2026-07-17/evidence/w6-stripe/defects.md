# W6 Stripe billing lifecycle — Defects

Evidence-only. Severity uses the campaign S-scale (S1 data-loss/overcharge/leak/bypass/crash >
S2 journey-blocking/fabricated-output/false-positive > S3 friction > S4 cosmetic). Raw traces
in `_results.json` and `api-traces/w6-lifecycle-steps.json`.

> Campaign defect register so far: D-01 malformed JSON→500 (P8) · D-03 export body-swap (P2,
> S1) · D-04 discuss empty-reply (P1, S2) · D-05 pdf export missing metadata title (P7, S3).
> **D-06 = this doc's first finding, D-07 = second.**

---

## D-06 (S1) — Checking out for a plan the user doesn't currently have, while already actively
subscribed to a different plan, is not blocked — real risk of a second, concurrent Stripe
subscription (double billing)

**Class:** S1 — overcharge risk on the money path. Not reproduced to completion (would require
actually finishing a hosted Stripe Checkout session with a real card), but the defect is fully
provable at the API layer: the endpoint that *creates* the billing commitment has no guard.

### Repro

```
POST /api/billing/checkout
Headers: x-e2e-test-secret, x-e2e-clerk-id: user_qa_p2, Content-Type: application/json
Body: {"plan": "indie", "billingInterval": "monthly"}
```
P2's actual state at the time of this call: `plan=professional, status=active` (unmodified,
seeded state — checked immediately before the call).

**Expected:** blocked, or redirected to the billing portal's native plan-swap flow (which DOES
prorate correctly against the *existing* subscription — proven working in `PRORATE-01`/`03` and
`PORTAL-02` below).

**Actual:** `200 {"url":"https://checkout.stripe.com/c/pay/cs_test_..."}` — a brand-new Stripe
Checkout session, in `mode: "subscription"`, is issued without checking whether
`db.subscription.findUnique({where:{userId}})` already shows an active plan. `api-traces/w6-lifecycle-steps.json` → `DUP-01`.

### Root cause

`src/app/api/billing/checkout/route.ts` reuses the existing Stripe **customer** id
(`sub?.stripeCustomerId`) when one exists, but never checks `sub.status`/`sub.plan` before
building a fresh `checkout.sessions.create({mode:"subscription", ...})` call. Stripe customers
can hold multiple concurrent subscriptions — nothing in this route or in the webhook handler
prevents that from happening.

On the client, `src/app/(app)/settings/billing/page.tsx` only shows the "Manage Subscription"
(portal) button when `plan.key === currentPlan` exactly (`isCurrent`); it shows an "Upgrade"
button — wired straight to this checkout route — on **every other plan card**, including plans
the user is not currently on but would naturally reach for from an active subscription (e.g. a
Professional subscriber clicking "Upgrade" on the Indie or Publisher card while already paying
for Professional). There is no client-side interstitial warning them they already have an
active subscription, and even if there were, the API itself doesn't enforce it — any direct
POST bypasses it entirely.

### Why this matters for trust

If a subscribed writer completes that checkout (real card, real flow), Stripe will happily spin
up a **second** active subscription against the same customer. Both would show as billable.
Nothing downstream reconciles or merges them — `customer.subscription.updated`/`.created`
handlers upsert by `userId` (unique per `Subscription` row in our schema), so the writer's DB
row would just get clobbered to reflect whichever webhook lands last, while Stripe keeps
charging for **both** subscriptions independently until a human notices and cancels the extra
one manually in the Stripe dashboard or portal. This is a direct overcharge risk, not a
theoretical one — the only thing standing between a normal "I want to switch plans" click and a
double-billed customer is the user happening to use the portal button instead of an upgrade
button, and nothing in the code enforces that choice.

### Suggested fix (evidence-gathering only — not applied, per task constraints)

In `checkout/route.ts`, before creating a session: if `sub?.status` is one of
`active/trialing/past_due`, return 409 with guidance to use the billing portal (which already
correctly prorates plan and interval changes on the *same* subscription — see `PRORATE-01`/`03`
below) instead of creating a parallel one. Alternatively/additionally, gate the "Upgrade" button
client-side to redirect to `manageBilling.mutate()` whenever any active subscription exists,
regardless of which specific plan card was clicked.

---

## D-07 (S2) — No in-app signal for `past_due` (dunning) or `cancel_at_period_end` (pending
cancellation) — the billing page looks identical to a healthy active subscription in both states

**Class:** S2 — silent-failure-adjacent. Not data loss, but a trust/communication gap: two of
the four states this campaign's own W6 spec asks to be "honest" about (`past-due/dunning ...
entitlement flips correct in-app on every transition ... honest UX copy`) render **zero**
visible difference from a fully healthy subscription.

### Evidence

`src/app/(app)/settings/billing/page.tsx` conditionally renders exactly two state banners:
`!stripeConfigured` (env-config warning) and `isTrialing` (trial-ending reminder, lines 170-186).
There is no conditional anywhere in the file keyed on `subscription.status === "past_due"` or
`subscription.cancelAtPeriodEnd === true` — both fields are already returned by
`GET /api/billing/subscription` (confirmed live: `DUN-01`/`CANCEL-01` in
`api-traces/w6-lifecycle-steps.json` show the API correctly reporting `status:"past_due"` and
`cancelAtPeriodEnd:true` respectively) but the UI never reads either field for display. A writer
whose card just failed, or who canceled last week and is coasting on the remainder of a paid
period, sees the exact same plan card — `Badge variant="default">Current</Badge>`, a normal
"Manage Subscription" button — as a writer in perfect standing.

### Why this matters for trust

- **past_due:** the app correctly keeps access open during Stripe's dunning retries
  (`plan-gating.ts` comment: `"past_due: still allow access (Stripe retries payment), but
  warn"` — the *warn* half of that comment is not implemented anywhere in the UI). A writer has
  no idea their card failed until Stripe's own retry cadence exhausts and the subscription is
  actually canceled out from under them mid-session, with no prior warning inside the product
  they were told to trust.
- **cancel_at_period_end:** a writer who canceled has no "your access ends on `{date}`"
  messaging anywhere — they can't tell, from inside the app, whether the cancellation
  registered at all, or when it takes effect. The only way to check is the Stripe-hosted portal.

### Suggested fix (evidence-gathering only — not applied, per task constraints)

Add two banners to `billing/page.tsx`, both reading fields the API already returns: a
`past_due` amber/red banner ("Your last payment failed — update your card in Manage
Subscription to avoid losing access") and a `cancelAtPeriodEnd` banner ("Your subscription is
set to end on `{currentPeriodEnd}` — you'll keep full access until then").

---

## Confirmed clean (explicitly recorded, not just omitted)

- **Webhook signature verification is correct and fails closed.** Missing `stripe-signature`
  header → 400 `{"error":"Missing signature"}`. Garbage/forged signature → 400
  `{"error":"Invalid signature"}` via `stripe.webhooks.constructEvent` throwing, caught cleanly,
  no Stripe internals or secret material leaked in either response.
- **Webhook replay is genuinely idempotent, not just advertised as such.** Re-posting the exact
  same event id — even with a **different** (attacker-or-bug-controlled) payload attached to it
  — is rejected via `StripeWebhookEvent.stripeEventId` unique constraint before any business
  logic runs; the DB row was verified byte-identical (`updated_at` timestamp unchanged) across
  the replay.
- **`customer.subscription.deleted` resolves correctly with zero metadata**, purely via
  `stripeSubscriptionId` lookup — this is the realistic path (Stripe's own deletion events don't
  carry app-specific metadata reliably), and it works.
- **past_due correctly preserves access** (Stripe-retry grace period) rather than punishing a
  writer for a transient card failure — confirmed via a real gated action (`create_series`)
  succeeding while `status=past_due`.
- **Cancellation is genuinely period-end, not immediate.** `cancel_at_period_end=true` alone
  does not revoke access (`CANCEL-02`); only the terminal `customer.subscription.deleted` event
  does (`CANCEL-04`, 403 confirmed).
- **Proration math is correct** on both an upgrade (Indie monthly → Professional monthly:
  -$49.00 / +$99.00) and a combined downgrade + interval change (Professional monthly → Indie
  **annual**: -$99.00 / +$490.00) — verified against Stripe's own computed pending invoice items
  on disposable, non-persona-linked test-mode subscriptions.
- **`planFromPriceId()` correctly resolves a real Stripe price id**, not just the fabricated
  ones used in the synthetic-event thread (`PRORATE-02` fed a genuine post-upgrade Stripe
  subscription object through the webhook with no crash).
- **Billing portal round-trip genuinely works** when wired to a real customer — returns a
  real, live `https://billing.stripe.com/p/session/...` URL (`PORTAL-02`) — and fails closed
  (generic 500, no leaked Stripe error detail) when the customer id doesn't exist in Stripe
  (`PORTAL-01`), rather than crashing or exposing internals.
- **Zero collateral damage.** All 7 other personas' subscription rows were read before and after
  this entire run and are byte-identical (`ISOLATION-01`). `user_qa_p2` was restored to its
  exact original seeded shape.
