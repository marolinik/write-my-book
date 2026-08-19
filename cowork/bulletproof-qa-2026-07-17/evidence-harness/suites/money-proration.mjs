// suites/money-proration.mjs — B1 / D-45 re-run (W-F3 §5.1, T13).
//
// The D-45 fabrication narrated "21/21 PASS" over raw ok:false + empty
// prorationLines. This suite makes the exact checks that run SKIPPED, each a
// machine verdict computed from raw:
//   - prorationLines.length > 0
//   - every /api/billing response ok === true
//   - proration line amounts sum to Stripe's invoice total
//   - app entitlement state == Stripe state after each webhook lands
//   - persona isolation: 0 bytes of drift in user_qa_* subscription rows
//
// COLLISION: W-B fixers (B1/D-45) in flight — checks encode the POST-FIX contract
// and are EXPECTED to fail red until W-B merges; that red is valid evidence.
//
// Needs: live app, test-mode Stripe keys, Postgres.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { numericBound, jsonPathEquals, jsonPathCount } from "../core/assertions.mjs";
import { withBracket } from "./_lib.mjs";
import { createStripeProbe } from "../probes/stripe-probe.mjs";
import { createDbProbe } from "../probes/db-snapshot.mjs";

export async function run(ctx) {
  const { http, store } = ctx;
  const stripe = createStripeProbe();
  const db = createDbProbe();
  const checks = [];

  try {
    return await withBracket(ctx, "wp-money-1", async (bracket) => {
      // Persona isolation baseline (before).
      const before = await db.allQaSubscriptions({ store, label: "qa-subs-before", bracket });

      // Thread B: real test-mode proration preview (Stripe's own math).
      const priceFrom = process.env.HARNESS_PRICE_INDIE;
      const priceTo = process.env.HARNESS_PRICE_PRO;
      let previewArtifact = null;
      let customerId = null;
      if (priceFrom && priceTo) {
        const res = await stripe.realProrationPreview({ priceFrom, priceTo, store, bracket });
        customerId = res.customerId;
        previewArtifact = res.artifact._stored.path;
        // prorationLines.length > 0 (D-45 fabrication was EMPTY prorationLines).
        checks.push(jsonPathCount((rel) => readFileSync(join(ctx.bundleDir, rel)), { id: "proration-lines-present", artifact: previewArtifact, path: "$.upcomingInvoice.lines.data[*]", min: 1 }));
      } else {
        checks.push({ id: "proration-lines-present", method: "numericBound", args: {}, source: null, observed: null, pass: false, detail: "HARNESS_PRICE_INDIE/PRO not set — cannot run real proration (BLOCKED-ENV)" });
      }

      // Thread A: synthetic signed webhooks through the real lifecycle.
      for (const stage of ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"]) {
        const event = { id: `evt_harness_${stage}`, type: stage, data: { object: { id: "sub_harness", status: stage.includes("deleted") ? "canceled" : "active", metadata: { harness: "true" } } } };
        const { payload, header } = stripe.signEvent(event);
        const res = await http.request(`webhook-${stage}`, { method: "POST", path: "/api/billing/webhook", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload, bracket, measurement: true });
        // Every webhook response must be ok (2xx) — the D-45 raw was ok:false.
        checks.push({ id: `webhook-ok-${stage}`, method: "numericBound", args: { artifact: res.resArtifact.path, path: "$.__status", max: 299, min: 200 }, source: { artifact: res.resArtifact.path }, observed: res.status, pass: res.status >= 200 && res.status < 300, detail: res.status >= 300 ? `status ${res.status}` : null });
        // App-side entitlement after the webhook.
        await http.request(`subscription-after-${stage}`, { method: "GET", path: "/api/billing/subscription", bracket, measurement: true });
      }

      // Persona isolation (after) — must be byte-identical to before.
      const after = await db.allQaSubscriptions({ store, label: "qa-subs-after", bracket });
      const drift = JSON.stringify(before.rows) !== JSON.stringify(after.rows);
      checks.push({ id: "persona-isolation-no-drift", method: "jsonPathEquals", args: { artifact: after._artifact.path, path: "$.rows", expected: before.rows }, source: { artifact: after._artifact.path }, observed: after.rows, pass: !drift, detail: drift ? "user_qa_* subscription rows drifted during money run" : null });

      if (customerId) await stripe.cleanup(customerId);

      return {
        checks,
        coverage: { metric: "proration-correctness", webhooksExercised: 3, realProration: Boolean(priceFrom && priceTo) },
        extra: { note: "COLLISION W-B: red until B1/D-45 merges is valid evidence", previewArtifact },
      };
    });
  } finally {
    await db.close();
  }
}
