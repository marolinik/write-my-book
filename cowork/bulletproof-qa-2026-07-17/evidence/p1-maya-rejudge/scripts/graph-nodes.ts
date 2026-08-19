/**
 * Read-only Neo4j census for P1 Maya's book. Reads NEO4J_* from process.env (never printed).
 * Counts nodes by label + lists Character/Event/Location names for bookId.
 * Usage: npx tsx --env-file=.env <thisfile> <outFile>
 */
import { getSession, closeNeo4j } from "../../../../../src/lib/graph/neo4j-client";
import { writeFileSync } from "node:fs";

const BOOK = "4116055c-6183-4675-926a-e04f31126951";
const out = process.argv[2];

async function main() {
  const session = getSession("READ");
  const result: any = { bookId: BOOK, capturedAt: new Date().toISOString() };
  try {
    const byLabel = await session.run(
      `MATCH (n {bookId:$b}) RETURN labels(n) AS labels, count(*) AS c ORDER BY c DESC`,
      { b: BOOK }
    );
    result.nodesByLabel = byLabel.records.map((r) => ({
      labels: r.get("labels"),
      count: (r.get("c") as any).toNumber ? (r.get("c") as any).toNumber() : r.get("c"),
    }));

    const names = await session.run(
      `MATCH (n {bookId:$b}) WHERE n.name IS NOT NULL
       RETURN labels(n)[0] AS label, n.name AS name, n.chapter AS chapter,
              n.deathChapter AS deathChapter, n.role AS role, n.aliases AS aliases
       ORDER BY label, name`,
      { b: BOOK }
    );
    result.namedNodes = names.records.map((r) => ({
      label: r.get("label"),
      name: r.get("name"),
      chapter: r.get("chapter"),
      deathChapter: r.get("deathChapter"),
      role: r.get("role"),
      aliases: r.get("aliases"),
    }));

    const rels = await session.run(
      `MATCH (a {bookId:$b})-[r]->(b2 {bookId:$b})
       RETURN type(r) AS type, count(*) AS c ORDER BY c DESC`,
      { b: BOOK }
    );
    result.relationshipsByType = rels.records.map((r) => ({
      type: r.get("type"),
      count: (r.get("c") as any).toNumber ? (r.get("c") as any).toNumber() : r.get("c"),
    }));
  } catch (e) {
    result.error = `${(e as Error).name}: ${(e as Error).message}`;
  } finally {
    await session.close();
    await closeNeo4j();
  }
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  console.log("nodesByLabel:", JSON.stringify(result.nodesByLabel ?? result.error));
  console.log("namedNodes:", JSON.stringify(result.namedNodes ?? []).slice(0, 800));
  console.log("relationshipsByType:", JSON.stringify(result.relationshipsByType ?? []));
}
main();
