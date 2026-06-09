/**
 * Neo4j driver singleton using the globalThis pattern (like Prisma db.ts).
 * Provides session helpers for read/write transactions.
 */

import neo4j, { type Driver, type Session } from "neo4j-driver";

const globalForNeo4j = globalThis as unknown as {
  __neo4jDriver: Driver | undefined;
};

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
  const user = process.env.NEO4J_USER ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "wmb-neo4j-dev";

  return neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 30_000,
    maxTransactionRetryTime: 15_000,
  });
}

export const neo4jDriver: Driver =
  globalForNeo4j.__neo4jDriver ?? createDriver();

if (process.env.NODE_ENV !== "production") {
  globalForNeo4j.__neo4jDriver = neo4jDriver;
}

/**
 * Get a Neo4j session for the default database.
 * Caller MUST close the session after use (use try/finally or `withSession`).
 */
export function getSession(mode: "READ" | "WRITE" = "WRITE"): Session {
  return neo4jDriver.session({
    defaultAccessMode:
      mode === "READ" ? neo4j.session.READ : neo4j.session.WRITE,
  });
}

/**
 * Execute a callback within a Neo4j session, auto-closing after completion.
 */
export async function withSession<T>(
  mode: "READ" | "WRITE",
  fn: (session: Session) => Promise<T>
): Promise<T> {
  const session = getSession(mode);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

/**
 * Gracefully close the Neo4j driver (for shutdown hooks).
 */
export async function closeNeo4j(): Promise<void> {
  await neo4jDriver.close();
}

/**
 * Verify connectivity to Neo4j.
 */
export async function verifyNeo4jConnection(): Promise<boolean> {
  try {
    await neo4jDriver.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}
