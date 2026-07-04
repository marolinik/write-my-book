import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so no real Postgres connection is created. The probe issues
// tagged-template `db.$queryRaw` calls; each yields `values` = [table] for a
// table check or [table, column] for a column check.
const h = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      h.queryRaw(strings, ...values),
  },
}));

import {
  REQUIRED_SCHEMA_OBJECTS,
  findMissingSchemaObjects,
  assertSchemaContract,
} from "@/lib/health/schema-contract";

/**
 * Make `$queryRaw` answer EXISTS() per object, treating every label in
 * `absent` as physically missing. Label = `${table}.${column}` for a column
 * probe, `${table}` for a table probe — matching REQUIRED_SCHEMA_OBJECTS.
 */
function mockSchema(absent: Set<string> = new Set()) {
  h.queryRaw.mockImplementation((_strings: TemplateStringsArray, ...values: string[]) => {
    const [table, column] = values;
    const label = column ? `${table}.${column}` : table;
    return Promise.resolve([{ present: !absent.has(label) }]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("schema-contract probe", () => {
  it("guards all four pending-migration gates", () => {
    expect(REQUIRED_SCHEMA_OBJECTS.map((o) => o.label)).toEqual([
      "books.archived_at",
      "continuity_flags",
      "finding_replies.role",
      "writer_memories.finding_id",
    ]);
  });

  it("reports no missing objects when the full contract is present", async () => {
    mockSchema();
    await expect(findMissingSchemaObjects()).resolves.toEqual([]);
  });

  it("passes the assertion (→ readiness stays healthy) when schema is current", async () => {
    mockSchema();
    await expect(assertSchemaContract()).resolves.toBeUndefined();
  });

  it("detects a missing column (books.archived_at)", async () => {
    mockSchema(new Set(["books.archived_at"]));
    await expect(findMissingSchemaObjects()).resolves.toEqual(["books.archived_at"]);
  });

  it("throws (→ readiness 503) when a required column is missing", async () => {
    mockSchema(new Set(["writer_memories.finding_id"]));
    await expect(assertSchemaContract()).rejects.toThrow(/writer_memories\.finding_id/);
  });

  it("throws (→ readiness 503) when a required table is missing", async () => {
    mockSchema(new Set(["continuity_flags"]));
    await expect(assertSchemaContract()).rejects.toThrow(/continuity_flags/);
  });

  it("lists every missing object when the schema is badly drifted", async () => {
    mockSchema(new Set(["books.archived_at", "finding_replies.role"]));
    await expect(findMissingSchemaObjects()).resolves.toEqual([
      "books.archived_at",
      "finding_replies.role",
    ]);
  });
});
