// Phase 4: honest-billing + routing check for THIS session's line-edit run.
// D-36 (fake success): confirm the completed session recorded REAL tokens/cost and
// the chapter status matches reality. D-43 (model routing, light): what model +
// agent_type were billed for the conductor-run line-edit.
import pg from "pg";
import { saveTrace } from "./_client";

const SESSION = "15c82e80-5296-49cf-a498-e77a651ce9b2";

async function main() {
  const out: Record<string, unknown> = {};
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const s = await client.query(
    "SELECT id, status, workflow_id, agent_type, tokens_input, tokens_output, actual_cost_usd, estimated_cost_usd, chapter_number, started_at, completed_at FROM agent_sessions WHERE id = $1",
    [SESSION]
  );
  out["session-row"] = s.rows[0];

  const ur = await client.query(
    "SELECT agent_type, model, tokens_input, tokens_output, cost_estimate, key_source, recorded_at FROM usage_records WHERE user_id = 'e02cdae6-4c74-43e8-bd0e-e888debabf7c' AND recorded_at >= '2026-07-20T00:00:00Z' ORDER BY recorded_at DESC LIMIT 10",
  );
  out["usage-records-today"] = ur.rows;

  // chapter 5 status (should NOT be falsely advanced by a real run that created findings)
  const ch = await client.query(
    "SELECT chapter_number, status, word_count FROM chapters WHERE id = '42a58de8-146d-43de-9797-7b236038a355'"
  );
  out["ch5-status"] = ch.rows[0];

  await client.end();
  saveTrace("p4-session-billing.json", out);
  console.log("session:", JSON.stringify(out["session-row"]));
  console.log("ch5-status:", JSON.stringify(out["ch5-status"]));
  console.log("usage-today:", JSON.stringify(out["usage-records-today"], null, 1));
}
main().catch((e) => { console.error("ERR", e?.stack ?? e?.message ?? e); process.exit(1); });
