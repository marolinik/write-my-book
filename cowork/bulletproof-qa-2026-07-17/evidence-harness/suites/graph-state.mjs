// suites/graph-state.mjs — D-63 attack-replay + relationship enum sweep (§5.3, T14).
//
// Two post-fix contracts for the continuity graph:
//   1. Enum sweep: every relationship type in the harness user's subgraph is a
//      member of the schema enum (post opus-fix-sec). Any foreign type => fail.
//   2. Cypher-injection replay: submit the D-63 payload (from
//      evidence/d63-cypher-injection.md) through the NORMAL extraction path, then
//      diff a SECOND user's subgraph snapshot before/after. The merge must be
//      sanitized (type coerced/rejected, no foreign-label damage) and user B's
//      subgraph must be byte-identical before and after.
//
// COLLISION: opus-fix-sec — coordinate the payload with the evidence doc.
//
// Needs: live app + single worker + Neo4j.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withBracket } from "./_lib.mjs";
import { createNeo4jProbe } from "../probes/neo4j-snapshot.mjs";

const D63_PAYLOAD_DOC = join(process.cwd(), "cowork/bulletproof-qa-2026-07-17/evidence/d63-cypher-injection.md");
// The allowed relationship-type enum (mirror src schema; kept here so the check is
// self-contained for a context-free judge). Update if the schema enum changes.
const REL_ENUM = ["APPEARS_IN", "RELATES_TO", "LOCATED_AT", "MEMBER_OF", "OWNS", "KNOWS", "MENTIONS", "PART_OF"];

export async function run(ctx) {
  const { http, store } = ctx;
  const neo4j = createNeo4jProbe();
  const checks = [];

  try {
    return await withBracket(ctx, "wp-graph-1", async (bracket) => {
      const uidA = "PLACEHOLDER_HARNESS_USER_A"; // attacker book owner (user_qa_h3)
      const uidB = "PLACEHOLDER_HARNESS_USER_B"; // bystander (user_qa_h4)

      // Snapshot bystander B before the attack.
      const beforeB = await neo4j.snapshot(uidB, { store, label: "neo4j-B-before", bracket });

      // Submit the D-63 injection payload through the normal extraction path.
      let payload = "Alice KNOWS Bob."; // fallback benign
      if (existsSync(D63_PAYLOAD_DOC)) {
        const doc = readFileSync(D63_PAYLOAD_DOC, "utf8");
        const m = doc.match(/```(?:text|cypher)?\n([\s\S]*?)```/);
        if (m) payload = m[1].trim();
      }
      const bookRes = await http.request("create-attack-book", { method: "POST", path: "/api/books", body: { title: "Harness D-63 Attack" }, bracket });
      const bookId = JSON.parse(bookRes.bodyBytes.toString("utf8")).id;
      const imp = await http.request("import-attack-chapter", { method: "POST", path: `/api/books/${bookId}/import`, body: { title: "attack", content: payload }, bracket });
      const chapterId = JSON.parse(imp.bodyBytes.toString("utf8")).id;
      await http.request("extract-entities", { method: "POST", path: `/api/books/${bookId}/chapters/${chapterId}/extract`, bracket, measurement: true });

      // Attacker A subgraph: enum sweep.
      const afterA = await neo4j.snapshot(uidA, { store, label: "neo4j-A-after", bracket });
      const foreignTypes = afterA.relTypes.filter((t) => !REL_ENUM.includes(t));
      checks.push({ id: "enum-sweep", method: "numericBound", args: { max: 0 }, source: { artifact: afterA._artifact.path, path: "$.relTypes" }, observed: foreignTypes.length, pass: foreignTypes.length === 0, detail: foreignTypes.length === 0 ? null : `foreign rel types: ${foreignTypes.join(", ")}` });

      // Bystander B: byte-identical before/after (no cross-tenant damage).
      const afterB = await neo4j.snapshot(uidB, { store, label: "neo4j-B-after", bracket });
      const bDrift = JSON.stringify(beforeB.nodes) !== JSON.stringify(afterB.nodes) || JSON.stringify(beforeB.edges) !== JSON.stringify(afterB.edges);
      checks.push({ id: "bystander-untouched", method: "jsonPathEquals", args: { artifact: afterB._artifact.path, path: "$.edges", expected: beforeB.edges }, source: { artifact: afterB._artifact.path }, observed: afterB.edges, pass: !bDrift, detail: bDrift ? "bystander subgraph changed during attack" : null });

      return {
        checks,
        coverage: { metric: "graph-injection-safety", foreignTypes: foreignTypes.length, bystanderDrift: bDrift },
        extra: { note: "COLLISION opus-fix-sec: payload coordinated with evidence/d63-cypher-injection.md", bookId, payloadSource: existsSync(D63_PAYLOAD_DOC) ? "doc" : "fallback-benign" },
      };
    });
  } finally {
    await neo4j.close();
  }
}
