# Clerk Authentication Verification

This checklist hardens authentication before production launch.

## Static configuration gate

Run:

```bash
npm run auth:check
```

The check verifies:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is present.
- `CLERK_SECRET_KEY` is present.
- `CLERK_WEBHOOK_SECRET` is present.
- Test/live Clerk keys are not mixed in production.
- Sign-in and sign-up URLs are relative paths or HTTPS URLs.
- `DEV_AUTH_BYPASS` is not enabled in production.

CI may use harmless placeholders; real production rejects placeholders through the
runtime env validator and this auth check.

## Middleware production behavior

- `/`, `/login`, `/signup`, `/privacy`, `/terms`, Clerk/Stripe webhooks, and
  `/api/health(.*)` are public.
- Protected routes call Clerk middleware when Clerk is configured.
- If Clerk is missing/misconfigured in production, protected routes fail closed
  with `503` instead of silently bypassing auth.
- `DEV_AUTH_BYPASS` and E2E header auth are ignored in production.

## Required Clerk webhook events

Configure Clerk webhook endpoint:

```text
POST https://your-domain.example/api/auth/webhook
```

Subscribe to:

- `user.created`
- `user.updated`
- `user.deleted`

The webhook handler verifies Svix signatures using `CLERK_WEBHOOK_SECRET` before
mutating the local `User` table.

## Manual staging verification

1. Deploy staging with production-mode runtime and test Clerk keys.
2. Run `npm run auth:check` in the deployed environment.
3. Visit `/signup` and create a user.
4. Confirm Clerk sends `user.created` and the local `User` row appears.
5. Update the user's email/name in Clerk and confirm local sync.
6. Delete the user in Clerk and confirm local deletion behavior is acceptable for
   your data-retention policy.
7. Confirm anonymous access to `/dashboard` is blocked.
8. Confirm `/api/health` and `/api/health/dependencies` remain reachable without auth.
9. Confirm `DEV_AUTH_BYPASS=true` is rejected by production env validation.
