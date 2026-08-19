// Phase 3: dismiss the dangler → D-55 (no rejectedAt on a writer dismissal) +
// WriterMemory constraint persistence (dismiss → conversation constraint). Reads
// the DB directly (raw SQL via pg, DATABASE_URL from env) to inspect rejected_at
// and writer_memories. Then restores ch5 to the planted probe (cleanup).
import { readFileSync } from "node:fs";
import pg from "pg";
import { api, saveTrace, BOOK_ID, CHAPTERS } from "./_client";

const DANGLER = "42e70291-7151-40e1-8918-9ae30d85173d";
const PLANTED_PATH =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p6-owen/manuscripts/owen-ch5-what-the-water-keeps.md";

async function main() {
  const out: Record<string, unknown> = {};
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  // --- Dismiss the dangler with a keep-as-is reason ---
  const dismiss = await api("PATCH", `/api/books/${BOOK_ID}/editorial/findings/${DANGLER}`, {
    action: "dismiss",
    reason: "Deliberate cognitive slippage — the narrator is tired climbing the steps.",
  });
  out["dismiss-response"] = dismiss;

  // --- D-55: read the finding row directly; rejected_at MUST be null on a writer dismissal ---
  const fr = await client.query(
    "SELECT id, status, dismiss_reason, rejected_at, rejection_reason, applied_at FROM edit_findings WHERE id = $1",
    [DANGLER]
  );
  out["D55-finding-row"] = fr.rows[0];

  // --- WriterMemory: conversation constraint(s) for this user/book ---
  const wm = await client.query(
    "SELECT id, category, content, source, active, finding_id, created_at FROM writer_memories WHERE user_id = 'user_qa_p6' ORDER BY created_at DESC LIMIT 20"
  );
  out["writer-memories"] = wm.rows;
  out["writer-memory-for-dangler"] = wm.rows.filter((r: Record<string, unknown>) => r.finding_id === DANGLER);

  await client.end();

  // --- Cleanup: restore ch5 to the planted probe ---
  const planted = readFileSync(PLANTED_PATH, "utf8").normalize("NFC");
  const restore = await api("PUT", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`, {
    markdown: planted,
    changeSource: "restore",
  });
  out["ch5-restore"] = { status: restore.status, version: (restore.body as { version?: number }).version };
  const verify = await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`);
  out["ch5-restore-verify"] = {
    matchesPlanted: ((verify.body as { markdown?: string }).markdown ?? "").normalize("NFC") === planted,
  };

  saveTrace("p3-dismiss-memory.json", out);
  console.log("dismiss status:", (dismiss as { status: number }).status);
  console.log("D55 finding row:", JSON.stringify(out["D55-finding-row"]));
  console.log("writer-memory-for-dangler:", JSON.stringify(out["writer-memory-for-dangler"]));
  console.log("ch5 restore matchesPlanted:", JSON.stringify(out["ch5-restore-verify"]));
}
main().catch((e) => {
  console.error("ERR", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
