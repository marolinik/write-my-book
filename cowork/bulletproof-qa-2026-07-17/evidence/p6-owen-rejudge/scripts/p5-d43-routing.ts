// Phase 5: D-43 definitive live re-test. Set modelEditor override to a resolvable
// premium registry ID (anthropic/opus) — leaving modelCoach/default at qwen —
// then run a line-edit and observe which model actually bills. If line-edit still
// bills the qwen default (agent_type writing-coach), the editor-role override does
// NOT govern line-edit (conductor-only) → D-43 STILL OPEN. Reverts the override.
import pg from "pg";
import { api, streamSSE, saveTrace, saveTranscript, BOOK_ID } from "./_client";

const USER_INT = "e02cdae6-4c74-43e8-bd0e-e888debabf7c";
const CH = 3; // fresh page, baseline 0 findings — cheap probe

async function billedModelSince(client: pg.Client, sinceIso: string) {
  const ur = await client.query(
    "SELECT agent_type, model, tokens_input, tokens_output, cost_estimate, recorded_at FROM usage_records WHERE user_id = $1 AND recorded_at >= $2 AND agent_type <> 'embedding' ORDER BY recorded_at DESC LIMIT 5",
    [USER_INT, sinceIso]
  );
  return ur.rows;
}

async function main() {
  const out: Record<string, unknown> = {};
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Set modelEditor override to premium (resolvable registry id)
  out["set-editor-override"] = await api("PATCH", `/api/settings/default-model`, {
    modelEditor: "anthropic/opus",
  });
  out["default-model-after-set"] = await api("GET", `/api/settings/default-model`);

  const sinceIso = new Date(Date.now() - 5000).toISOString();

  // 2. Run a line-edit with editor override set
  const start = await api("POST", `/api/books/${BOOK_ID}/agent`, { workflowId: "line-edit", chapterNumber: CH });
  out["start"] = start;
  const sessionId = (start.body as { sessionId?: string }).sessionId;
  console.log("session", sessionId);
  if (sessionId) {
    const stream = await streamSSE(`/api/books/${BOOK_ID}/agent/${sessionId}/stream`, (ev) => {
      if (ev.type === "cost_update") {
        const md = (ev as { metadata?: { model?: string } }).metadata;
        if (md?.model) console.log("  cost_update model:", md.model);
      }
    }, 480000);
    out["stream-final"] = stream.final;
    saveTranscript("d43-lineedit-ch3-editoroverride-sse.json", {
      sessionId, nEvents: stream.nEvents, elapsed: stream.elapsed, final: stream.final,
      costUpdates: stream.events.filter((e) => e.ev.type === "cost_update").map((e) => (e.ev as { metadata?: { model?: string } }).metadata?.model),
    });

    // 3. Read the billed model from usage_records + session row
    const sRow = await client.query(
      "SELECT id, status, agent_type, tokens_input, tokens_output, actual_cost_usd FROM agent_sessions WHERE id = $1",
      [sessionId]
    );
    out["session-row"] = sRow.rows[0];
    out["billed-usage"] = await billedModelSince(client, sinceIso);
  }

  // 4. Revert override
  out["revert-editor-override"] = await api("PATCH", `/api/settings/default-model`, { modelEditor: null });
  out["default-model-after-revert"] = await api("GET", `/api/settings/default-model`);

  await client.end();
  saveTrace("p5-d43-routing.json", out);
  console.log("\n=== D-43 ===");
  console.log("editor override set to: anthropic/opus");
  console.log("billed usage:", JSON.stringify(out["billed-usage"], null, 1));
  console.log("session:", JSON.stringify(out["session-row"]));
}
main().catch((e) => { console.error("ERR", e?.stack ?? e?.message ?? e); process.exit(1); });
