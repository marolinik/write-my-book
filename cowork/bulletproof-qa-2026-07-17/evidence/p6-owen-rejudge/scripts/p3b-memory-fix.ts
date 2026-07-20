// Phase 3b: resolve the internal User.id for clerk user_qa_p6, then read
// writer_memories + finding_replies for the dangler to confirm the dismiss →
// conversation-constraint loop (WriterMemory persistence).
import pg from "pg";
import { saveTrace } from "./_client";

const DANGLER = "42e70291-7151-40e1-8918-9ae30d85173d";

async function main() {
  const out: Record<string, unknown> = {};
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const u = await client.query("SELECT id, clerk_id FROM users WHERE clerk_id = $1", ["user_qa_p6"]);
  const userId = u.rows[0]?.id as string;
  out["user"] = { internalId: userId, clerkId: u.rows[0]?.clerk_id };

  const wm = await client.query(
    "SELECT id, category, content, source, active, finding_id, created_at, updated_at FROM writer_memories WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 30",
    [userId]
  );
  out["writer-memories-all"] = wm.rows;
  out["writer-memory-for-dangler"] = wm.rows.filter((r: Record<string, unknown>) => r.finding_id === DANGLER);

  const replies = await client.query(
    "SELECT role, left(content, 500) as content_head, created_at FROM finding_replies WHERE finding_id = $1 ORDER BY created_at ASC",
    [DANGLER]
  );
  out["dangler-replies"] = replies.rows;

  await client.end();
  saveTrace("p3b-memory-fix.json", out);
  console.log("userId:", userId);
  console.log("writer-memories count:", wm.rows.length);
  console.log("for-dangler:", JSON.stringify(out["writer-memory-for-dangler"], null, 1));
  console.log("all memories:", JSON.stringify(wm.rows.map((r: Record<string, unknown>) => ({ cat: r.category, content: r.content, source: r.source, fid: (r.finding_id as string)?.slice(0,8), active: r.active })), null, 1));
}
main().catch((e) => { console.error("ERR", e?.stack ?? e?.message ?? e); process.exit(1); });
