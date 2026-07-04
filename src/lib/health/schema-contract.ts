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
 * Objects that MUST exist for this release to serve requests without 500s.
 * Physical names are the Prisma `@@map`/`@map` values, not the model names.
 */
export const REQUIRED_SCHEMA_OBJECTS: readonly RequiredSchemaObject[] = [
  { label: "books.archived_at", table: "books", column: "archived_at" },
  { label: "continuity_flags", table: "continuity_flags" },
  { label: "finding_replies.role", table: "finding_replies", column: "role" },
  { label: "writer_memories.finding_id", table: "writer_memories", column: "finding_id" },
];

/** True when `table.column` exists in the public schema. Parameterized. */
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS present
  `;
  return rows[0]?.present === true;
}

/** True when `table` exists in the public schema. Parameterized. */
async function tableExists(table: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table}
    ) AS present
  `;
  return rows[0]?.present === true;
}

/**
 * Labels of every required object that is NOT present in the live schema.
 * Empty array → the deployed schema satisfies this release's contract.
 */
export async function findMissingSchemaObjects(): Promise<string[]> {
  const results = await Promise.all(
    REQUIRED_SCHEMA_OBJECTS.map(async (obj) => {
      const present = obj.column
        ? await columnExists(obj.table, obj.column)
        : await tableExists(obj.table);
      return present ? null : obj.label;
    })
  );
  return results.filter((label): label is string => label !== null);
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
