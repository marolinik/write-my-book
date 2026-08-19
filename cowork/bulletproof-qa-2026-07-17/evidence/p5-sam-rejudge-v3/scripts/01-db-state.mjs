// P5 Sam re-judge v3 — read-only DB state probe (baseline + final snapshots).
// Reports Sam's live state that drives the AI-assist path: default_model,
// validated API keys (PROVIDER + validated flag + key LENGTH only — never the
// key value), book + first chapter, free_tier_usage meter row, and
// usage_records (count + recent rows: id, agent_type, model, tokens, cost,
// created_at). Used before AND after the AI run to prove the 422 path bills
// nothing while genuine 200s bill normally.
//
// DATABASE_URL is read from process.env (via --env-file=.env) and NEVER printed.
// Run:  npx tsx --env-file=.env <thisfile> <outfile> [label]
import pg from "pg";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] || "./01-db-state.json";
const LABEL = process.argv[3] || "snapshot";
const CLERK_ID = "user_qa_p5";
const url = process.env.DATABASE_URL;
const report = { capturedAt: new Date().toISOString(), label: LABEL, clerkId: CLERK_ID, checks: {} };

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

  const ur = await client.query(
    "SELECT id, email, display_name, default_model, global_model_editor, global_model_ghostwriter FROM users WHERE clerk_id = $1",
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
      modelEditor: sam.global_model_editor,
      modelGhostwriter: sam.global_model_ghostwriter,
    };

    const sub = await client.query(
      "SELECT plan, status FROM subscriptions WHERE user_id = $1",
      [userId]
    );
    report.checks.samSubscription = sub.rows[0] ?? null;

    const keys = await client.query(
      "SELECT provider, validated_at, length(encrypted_key) AS key_len FROM api_keys WHERE user_id = $1",
      [userId]
    );
    report.checks.samApiKeys = keys.rows.map((k) => ({
      provider: k.provider,
      validated: k.validated_at != null,
      encryptedKeyLen: k.key_len,
    }));

    const books = await client.query(
      "SELECT id, name, language, archived_at FROM books WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    report.checks.samBookCount = books.rows.length;
    report.checks.samBooks = [];
    for (const b of books.rows) {
      const ch = await client.query(
        "SELECT id, chapter_number, word_count FROM chapters WHERE book_id = $1 ORDER BY chapter_number ASC",
        [b.id]
      );
      report.checks.samBooks.push({
        id: b.id,
        name: b.name,
        language: b.language,
        archived: b.archived_at != null,
        chapters: ch.rows.map((c) => ({ id: c.id, n: c.chapter_number, words: c.word_count })),
      });
    }

    const meter = await client.query(
      "SELECT * FROM free_tier_usage WHERE user_id = $1",
      [userId]
    );
    report.checks.samFreeTierUsageRow = meter.rows[0] ?? null;

    const uxCount = await client.query(
      "SELECT count(*)::int AS n FROM usage_records WHERE user_id = $1",
      [userId]
    );
    report.checks.samUsageRecordCount = uxCount.rows[0].n;

    const uxRows = await client.query(
      "SELECT id, agent_type, model, tokens_input, tokens_output, cost_estimate, key_source, recorded_at FROM usage_records WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 30",
      [userId]
    );
    report.checks.samUsageRecordsRecent = uxRows.rows.map((r) => ({
      id: r.id,
      agentType: r.agent_type,
      model: r.model,
      tokensInput: r.tokens_input,
      tokensOutput: r.tokens_output,
      costEstimate: r.cost_estimate,
      keySource: r.key_source,
      recordedAt: r.recorded_at,
    }));
  }
} catch (e) {
  report.checks.queryError = String(e).slice(0, 800);
} finally {
  await client.end().catch(() => {});
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
