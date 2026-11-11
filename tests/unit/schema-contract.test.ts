import { describe, it, expect, vi, beforeEach } from "vitest";

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
 * Readiness checks every table and column of schema.prisma (P1-19), not four
 * hand-picked July objects. The probe is one information_schema query; this
 * mock answers it with the contract minus the labels a test marks absent (an
 * absent table drops all of its columns).
 */
function mockSchema(absent: Set<string> = new Set()) {
  const rows = REQUIRED_SCHEMA_OBJECTS.filter(
    (o) => o.column && !absent.has(o.label) && !absent.has(o.table)
  ).map((o) => ({ table_name: o.table, column_name: o.column as string }));
  h.queryRaw.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("schema-contract probe", () => {
  it("guards every table and column of schema.prisma, including the old four gates", () => {
    const labels = REQUIRED_SCHEMA_OBJECTS.map((o) => o.label);
    expect(labels.length).toBeGreaterThan(400);
    for (const gate of ["books.archived_at", "continuity_flags", "finding_replies.role", "writer_memories.finding_id"]) {
      expect(labels).toContain(gate);
    }
  });

  it("reports no missing objects when the full contract is present", async () => {
    mockSchema();
    await expect(findMissingSchemaObjects()).resolves.toEqual([]);
    expect(h.queryRaw).toHaveBeenCalledTimes(1);
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
    mockSchema(new Set(["usage_records.book_id"]));
    await expect(assertSchemaContract()).rejects.toThrow(/usage_records\.book_id/);
  });

  it("throws (→ readiness 503) when a required table is missing", async () => {
    mockSchema(new Set(["account_erasures"]));
    await expect(assertSchemaContract()).rejects.toThrow(/account_erasures/);
  });

  it("lists every missing object when the schema is badly drifted", async () => {
    mockSchema(new Set(["continuity_flags", "finding_replies.role"]));
    const missing = await findMissingSchemaObjects();
    expect(missing).toContain("continuity_flags");
    expect(missing).toContain("finding_replies.role");
  });
});
