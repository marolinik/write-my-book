// P1-17: imported FIRST by src/worker.ts, before anything that imports the
// database. db.ts asserts the env of its runtime target at import time; the
// worker's documented env has no Clerk or Stripe keys, so it must be checked
// as a worker, not as the web app.
process.env.WMB_RUNTIME_TARGET ??= "worker";

export {};
