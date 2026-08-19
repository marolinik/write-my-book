// probes/db-snapshot.mjs — read-only Postgres snapshots (W-F3 §1.2, T4).
//
// Read-ONLY by construction: only SELECT strings appear here; no INSERT/UPDATE/
// DELETE. Results are ordered deterministically (ORDER BY id) so before/after
// snapshots diff cleanly, then written to the artifact store as JSON.
//
// Uses the existing `pg` dependency (no new dep).

import pg from "pg";

const SELECTS = {
  books: `SELECT id, user_id, title, status, archived_at, created_at FROM books WHERE user_id = $1 ORDER BY id`,
  chapters: `SELECT c.id, c.book_id, c.title, c.position, length(c.content) AS content_len FROM chapters c JOIN books b ON b.id = c.book_id WHERE b.user_id = $1 ORDER BY c.id`,
  subscriptions: `SELECT id, user_id, plan, status, billing_interval, current_period_start, current_period_end FROM subscriptions WHERE user_id = $1 ORDER BY id`,
  usage_records: `SELECT id, user_id, model, prompt_tokens, completion_tokens, cost_usd, created_at FROM usage_records WHERE user_id = $1 ORDER BY id`,
  agent_sessions: `SELECT id, user_id, book_id, kind, status, created_at FROM agent_sessions WHERE user_id = $1 ORDER BY id`,
  writer_memories: `SELECT id, user_id, kind, created_at FROM writer_memories WHERE user_id = $1 ORDER BY id`,
};

/**
 * @param {{ databaseUrl?: string }} [cfg]
 */
export function createDbProbe(cfg = {}) {
  const dbUrl = cfg.databaseUrl ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("[db-probe] DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: dbUrl });

  /**
   * Snapshot the declared tables for a userId. Optionally restrict to a subset.
   * @param {string} userId
   * @param {{ tables?: string[], store?: any, label?: string, bracket?: string|null }} opts
   */
  async function snapshot(userId, opts = {}) {
    const tables = opts.tables ?? Object.keys(SELECTS);
    const out = { userId, capturedAtUtc: new Date().toISOString(), tables: {} };
    const client = await pool.connect();
    try {
      for (const t of tables) {
        const sql = SELECTS[t];
        if (!sql) throw new Error(`[db-probe] no read-only query for table "${t}"`);
        const { rows } = await client.query(sql, [userId]);
        out.tables[t] = rows;
      }
    } finally {
      client.release();
    }
    if (opts.store) {
      out._artifact = opts.store.writeJson(out, { label: opts.label ?? `db-snapshot-${userId}`, kind: "db-snapshot", bracket: opts.bracket ?? null, meta: { userId, tables } });
    }
    return out;
  }

  /** Snapshot ALL user_qa_* subscription rows (persona-isolation drift check, §5.1). */
  async function allQaSubscriptions(opts = {}) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT u.clerk_id, s.plan, s.status, s.current_period_end FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.clerk_id LIKE 'user_qa_%' ORDER BY u.clerk_id`,
      );
      const out = { capturedAtUtc: new Date().toISOString(), rows };
      if (opts.store) out._artifact = opts.store.writeJson(out, { label: opts.label ?? "db-all-qa-subs", kind: "db-snapshot", bracket: opts.bracket ?? null, meta: { scope: "user_qa_*" } });
      return out;
    } finally {
      client.release();
    }
  }

  async function close() {
    await pool.end();
  }

  return { snapshot, allQaSubscriptions, close };
}
