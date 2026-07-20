// Deploy-gate canary: does the dev DB have the free_tier_usage table?
// Reads DATABASE_URL from process.env (via --env-file=.env). Never prints it.
import pg from "pg";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] || "./db-table-check.json";
const url = process.env.DATABASE_URL;
const report = { capturedAt: new Date().toISOString(), checks: {} };

if (!url) {
  report.checks.error = "DATABASE_URL not in process.env";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
// mask host only for provenance, never the full url / creds
try {
  const u = new URL(url);
  report.dbHostMasked = u.hostname + ":" + u.port + u.pathname;
} catch {
  report.dbHostMasked = "<unparseable>";
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const q = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1) ORDER BY table_name",
    [["free_tier_usage", "subscriptions", "books", "users", "chapters"]]
  );
  report.checks.tablesPresent = q.rows.map((r) => r.table_name);
  report.checks.freeTierUsagePresent = q.rows.some((r) => r.table_name === "free_tier_usage");

  if (report.checks.freeTierUsagePresent) {
    const c = await client.query("SELECT count(*)::int AS n FROM free_tier_usage");
    report.checks.freeTierUsageRowCount = c.rows[0].n;
  }
} catch (e) {
  report.checks.queryError = String(e).slice(0, 600);
} finally {
  await client.end().catch(() => {});
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
