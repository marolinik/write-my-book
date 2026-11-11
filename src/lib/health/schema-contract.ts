/**
 * Schema-contract probe.
 *
 * `/api/health/dependencies` used to prove the database was reachable with a
 * bare `SELECT 1` — which stays green even when the running code expects a
 * NEWER schema than what is actually deployed (a C0-class blind spot: readiness
 * is green while every request that touches a pending column 500s). This probe
 * closes that gap by asserting, against `information_schema`, that the exact set
 * of objects THIS release depends on is physically present. A missing object →
 * the "schema" dependency reports error → readiness returns 503 on drift.
 *
 * The required set is the four migration gates the code already reads/writes
 * before their migrations are guaranteed applied (see the mission handoff):
 *   - column  books.archived_at            (Tier 4.8 The Shelf)
 *   - table   continuity_flags             (Tier 4.4 live continuity net)
 *   - column  finding_replies.role         (Tier 4.2 conversational findings)
 *   - column  writer_memories.finding_id   (Tier 4.2 conversational findings)
 */

import { GENERATED_SCHEMA_OBJECTS } from "./schema-contract.generated";
import { db } from "@/lib/db";

/** One physical object the running release requires. */
export interface RequiredSchemaObject {
  /** Human-readable label surfaced in the failure message. */
  label: string;
  /** Physical (`@@map`ped) table name. */
  table: string;
  /** Physical column name. Omit to assert only that the table exists. */
  column?: string;
}

/**
 * Every table and column the app reads (P1-19), generated from
 * prisma/schema.prisma by `npm run schema:contract`. Physical names are the
 * Prisma `@@map`/`@map` values, not the model names.
 */
export const REQUIRED_SCHEMA_OBJECTS: readonly RequiredSchemaObject[] = GENERATED_SCHEMA_OBJECTS;

/**
 * Labels of every required object that is NOT present in the live schema.
 * One query for the whole public schema. Empty array → the deployed schema
 * satisfies this release's contract.
 */
export async function findMissingSchemaObjects(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const tables = new Set(rows.map((r) => r.table_name));
  const columns = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  return REQUIRED_SCHEMA_OBJECTS.filter((obj) =>
    obj.column ? !columns.has(`${obj.table}.${obj.column}`) : !tables.has(obj.table)
  ).map((obj) => obj.label);
}

/**
 * Readiness assertion: throws when the live schema is missing any object this
 * release depends on, so `/api/health/dependencies` returns 503 (monitoring
 * goes red) on schema drift. Mirrors `assertWorkerLiveness` — the `runCheck`
 * wrapper in `dependencies.ts` catches the throw and reports it fail-safe as an
 * error dependency, so a probe failure never escapes `checkDependencies()`.
 */
export async function assertSchemaContract(): Promise<void> {
  const missing = await findMissingSchemaObjects();
  if (missing.length > 0) {
    throw new Error(
      `Database schema is missing required objects (pending migration?): ${missing.join(", ")}`
    );
  }
}
