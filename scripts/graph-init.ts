/**
 * Create the Neo4j constraints and indexes the story graph relies on (P1-20).
 * The worker runs this at boot; run it by hand after a fresh Neo4j:
 *   npm run graph:init
 */
import "dotenv/config";
import { initGraphSchema } from "../src/lib/graph";
import { closeNeo4j } from "../src/lib/graph/neo4j-client";

initGraphSchema()
  .then(() => console.log("graph schema: constraints and indexes are in place"))
  .catch((error: unknown) => {
    console.error("graph schema init failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeNeo4j());
