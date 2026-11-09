// The suite assumes a self-hosted shell. With STRIPE_SECRET_KEY set, importing
// the billing client turns on Free-tier enforcement, so the same commit passed
// on one machine and failed in CI. Vitest loads this before any test module.
delete process.env.STRIPE_SECRET_KEY;
