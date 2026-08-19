// Read-only introspection of the free_tier_usage table structure to explain why
// db.freeTierUsage.findUnique still throws (billing + ghost-text 500) even though
// the table now exists. Compares actual columns + unique indexes to the Prisma
// model's expectation (id, user_id, day, ghost_text_calls, inline_edit_calls;
// composite UNIQUE(user_id, day) that backs the `userId_day` findUnique key).
// DATABASE_URL read from process.env; never printed.
import pg from "pg";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] || "./introspect-free-tier-usage.json";
const url = process.env.DATABASE_URL;
const report = { capturedAt: new Date().toISOString(), table: "free_tier_usage", expected: {
  columns: ["id", "user_id", "day", "ghost_text_calls", "inline_edit_calls"],
  uniqueOn: ["user_id", "day"],
}};
if (!url) { report.error = "no DATABASE_URL"; writeFileSync(OUT, JSON.stringify(report, null, 2)); process.exit(2); }

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='free_tier_usage'
      ORDER BY ordinal_position`
  );
  report.actualColumns = cols.rows;

  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename='free_tier_usage'`
  );
  report.actualIndexes = idx.rows;

  const cons = await client.query(
    `SELECT conname, contype, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'public.free_tier_usage'::regclass`
  );
  report.actualConstraints = cons.rows;

  // Diff
  const actualColNames = cols.rows.map((r) => r.column_name);
  report.missingColumns = report.expected.columns.filter((c) => !actualColNames.includes(c));
  report.extraColumns = actualColNames.filter((c) => !report.expected.columns.includes(c));
  const hasComposite = [...idx.rows, ...cons.rows].some((r) => {
    const s = (r.indexdef || r.def || "").toLowerCase();
    return s.includes("user_id") && s.includes("day") && (s.includes("unique") || r.contype === "u");
  });
  report.hasCompositeUniqueUserIdDay = hasComposite;
} catch (e) {
  report.queryError = String(e).slice(0, 800);
} finally {
  await client.end().catch(() => {});
}
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
