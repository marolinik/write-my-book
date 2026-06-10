# Stripe Billing Verification

This checklist hardens the billing path before production launch.

## Static configuration gate

Run locally or in CI:

```bash
npm run billing:check
```

The check verifies:

- `STRIPE_SECRET_KEY` is present.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is present.
- `STRIPE_WEBHOOK_SECRET` is present.
- Every purchasable plan has a configured Stripe Price ID.
- Founder remains monthly-only.
- Real production runtime rejects placeholders and mismatched test/live key pairs.

CI uses safe dummy `price_ci_*` values. Real production must inject actual Stripe
values through the deployment platform.

## Required Stripe products/prices

| Plan | Required prices |
|---|---|
| Founder | `STRIPE_FOUNDER_MONTHLY_PRICE_ID` |
| Indie | `STRIPE_INDIE_MONTHLY_PRICE_ID`, `STRIPE_INDIE_ANNUAL_PRICE_ID` |
| Professional | `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID` |
| Publisher | `STRIPE_PUBLISHER_MONTHLY_PRICE_ID`, `STRIPE_PUBLISHER_ANNUAL_PRICE_ID` |

## Required webhook events

Configure the Stripe webhook endpoint:

```text
POST https://your-domain.example/api/billing/webhook
```

Subscribe at least to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

## Manual test-mode verification

1. Use test-mode Stripe keys and test-mode price IDs.
2. Deploy staging with `NODE_ENV=production`, `CI=false`, and real test-mode Stripe env values.
3. Run `npm run billing:check` in the deployed environment.
4. Create checkout sessions for each purchasable plan/interval.
5. Complete checkout with Stripe test card `4242 4242 4242 4242`.
6. Confirm webhook creates/updates the local subscription record.
7. Open the customer billing portal from `/settings/billing`.
8. Cancel a subscription in Stripe and confirm app status becomes canceled.
9. Simulate `invoice.payment_failed` and confirm app status becomes `past_due` or access remains according to policy.

Do not launch paid production until all steps pass in staging.
