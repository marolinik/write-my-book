// probes/neo4j-snapshot.mjs — read-only, deterministically-sorted graph snapshots.
//
// (W-F3 §5.3, T5.) Read-only Cypher scoped to a single userId. Nodes and edges are
// sorted by id so before/after snapshots diff cleanly — deterministic serialization
// is the whole point (it makes "the D-63 attack changed nothing in user B's subgraph"
// a byte-diff instead of a judgment call).
//
// Uses the existing `neo4j-driver` dependency (no new dep).

import neo4j from "neo4j-driver";

/**
 * @param {{ uri?: string, user?: string, password?: string }} [cfg]
 */
export function createNeo4jProbe(cfg = {}) {
  const uri = cfg.uri ?? process.env.NEO4J_URI ?? "bolt://localhost:7687";
  const user = cfg.user ?? process.env.NEO4J_USER ?? "neo4j";
  const password = cfg.password ?? process.env.NEO4J_PASSWORD ?? "";
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

  /**
   * Snapshot every node + relationship owned by userId, sorted.
   * @param {string} userId
   * @param {{ store?: any, label?: string, bracket?: string|null }} opts
   */
  async function snapshot(userId, opts = {}) {
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const nodeRes = await session.run(
        `MATCH (n {userId: $uid}) RETURN labels(n) AS labels, properties(n) AS props ORDER BY coalesce(n.id, elementId(n))`,
        { uid: userId },
      );
      const edgeRes = await session.run(
        `MATCH (a {userId: $uid})-[r]->(b {userId: $uid}) RETURN a.id AS from, type(r) AS type, properties(r) AS props, b.id AS to ORDER BY a.id, type(r), b.id`,
        { uid: userId },
      );
      const nodes = nodeRes.records
        .map((rec) => ({ labels: [...rec.get("labels")].sort(), props: normalizeProps(rec.get("props")) }))
        .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
      const edges = edgeRes.records
        .map((rec) => ({ from: rec.get("from"), type: rec.get("type"), to: rec.get("to"), props: normalizeProps(rec.get("props")) }))
        .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
      const out = { userId, capturedAtUtc: new Date().toISOString(), nodeCount: nodes.length, edgeCount: edges.length, relTypes: [...new Set(edges.map((e) => e.type))].sort(), nodes, edges };
      if (opts.store) out._artifact = opts.store.writeJson(out, { label: opts.label ?? `neo4j-${userId}`, kind: "neo4j-snapshot", bracket: opts.bracket ?? null, meta: { userId } });
      return out;
    } finally {
      await session.close();
    }
  }

  async function close() {
    await driver.close();
  }

  return { snapshot, close };
}

/** neo4j Integer -> JS number; keep other values as-is. */
function normalizeProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    out[k] = neo4j.isInt(v) ? v.toNumber() : v;
  }
  return out;
}
