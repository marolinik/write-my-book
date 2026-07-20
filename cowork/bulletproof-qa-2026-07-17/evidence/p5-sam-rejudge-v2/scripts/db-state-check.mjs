// P5 Sam re-judge v2 — read-only DB state probe.
// Confirms free_tier_usage now EXISTS (was the D-92a deploy drift) and reports
// Sam's live state that predicts the AI-assist path: default_model, validated
// API keys (PROVIDER + validated flag + key LENGTH only — never the key value),
// book count, and any free_tier_usage meter row.
// DATABASE_URL is read from process.env (via --env-file=.env) and NEVER printed.
// Run:  node --env-file=.env <thisfile> <outfile>
import pg from "pg";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] || "./db-state-check.json";
const CLERK_ID = "user_qa_p5";
const url = process.env.DATABASE_URL;
const report = { capturedAt: new Date().toISOString(), clerkId: CLERK_ID, checks: {} };

if (!url) {
  report.checks.error = "DATABASE_URL not in process.env";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
try {
  const u = new URL(url);
  report.dbHostMasked = u.hostname + ":" + u.port + u.pathname;
} catch {
  report.dbHostMasked = "<unparseable>";
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();

  // 1. free_tier_usage table now present? (D-92a canary)
  const t = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1) ORDER BY table_name",
    [["free_tier_usage", "subscriptions", "books", "users", "chapters", "usage_records", "api_keys"]]
  );
  report.checks.tablesPresent = t.rows.map((r) => r.table_name);
  report.checks.freeTierUsagePresent = t.rows.some((r) => r.table_name === "free_tier_usage");
  if (report.checks.freeTierUsagePresent) {
    const c = await client.query("SELECT count(*)::int AS n FROM free_tier_usage");
    report.checks.freeTierUsageTotalRows = c.rows[0].n;
  }

  // 2. Sam's user row
  const ur = await client.query(
    "SELECT id, email, display_name, default_model, created_at FROM users WHERE clerk_id = $1",
    [CLERK_ID]
  );
  if (ur.rows.length === 0) {
    report.checks.samUser = null;
  } else {
    const sam = ur.rows[0];
    const userId = sam.id;
    report.checks.samUser = {
      id: userId,
      email: sam.email,
      displayName: sam.display_name,
      defaultModel: sam.default_model,
    };

    // 3. Sam's subscription (should be none/unsubscribed)
    const sub = await client.query(
      "SELECT plan, status FROM subscriptions WHERE user_id = $1",
      [userId]
    );
    report.checks.samSubscription = sub.rows[0] ?? null;

    // 4. Sam's API keys — PROVIDER + validated flag + key length only (never value)
    const keys = await client.query(
      "SELECT provider, validated_at, length(encrypted_key) AS key_len FROM api_keys WHERE user_id = $1",
      [userId]
    );
    report.checks.samApiKeys = keys.rows.map((k) => ({
      provider: k.provider,
      validated: k.validated_at != null,
      encryptedKeyLen: k.key_len,
    }));

    // 5. Sam's books + first chapter per book (for AI-assist + export targeting)
    const books = await client.query(
      "SELECT id, name, language, archived_at FROM books WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    report.checks.samBookCount = books.rows.length;
    report.checks.samBooks = [];
    for (const b of books.rows) {
      const ch = await client.query(
        "SELECT id, chapter_number FROM chapters WHERE book_id = $1 ORDER BY chapter_number ASC LIMIT 1",
        [b.id]
      );
      report.checks.samBooks.push({
        id: b.id,
        name: b.name,
        language: b.language,
        archived: b.archived_at != null,
        firstChapterId: ch.rows[0]?.id ?? null,
      });
    }

    // 6. Sam's free_tier_usage meter row (if any)
    const meter = await client.query(
      "SELECT * FROM free_tier_usage WHERE user_id = $1",
      [userId]
    );
    report.checks.samFreeTierUsageRow = meter.rows[0] ?? null;

    // 7. Sam's usage_records count (ghost-text/inline-edit produce these)
    const ux = await client.query(
      "SELECT count(*)::int AS n FROM usage_records WHERE user_id = $1",
      [userId]
    );
    report.checks.samUsageRecordCount = ux.rows[0].n;
  }
} catch (e) {
  report.checks.queryError = String(e).slice(0, 800);
} finally {
  await client.end().catch(() => {});
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
