import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The edit log is the only record of when a writer decided what. On
 * 2026-09-23 the local database lost 126 of its rows after a restart, cause
 * unknown, and no application code deletes them. A trigger now refuses any
 * delete while the row's book exists, and TRUNCATE outright. Prisma's `db push`
 * does not manage triggers, so the guard only exists if the deploy applies it.
 * Verified live: direct delete and deleteMany refused, deleting the book
 * still cascades.
 */

const root = process.cwd();

describe("edit_actions is append-only while its book exists", () => {
  const sql = readFileSync(join(root, "scripts/db-guards.sql"), "utf8");

  it("refuses row deletes unless the book itself is gone", () => {
    expect(sql).toMatch(/BEFORE DELETE ON edit_actions/);
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM books WHERE id = OLD\.book_id\)/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it("refuses TRUNCATE, which row triggers cannot see", () => {
    expect(sql).toMatch(/BEFORE TRUNCATE ON edit_actions/);
  });

  it("is idempotent, so the deploy can run it every time", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION edit_actions_append_only/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS edit_actions_append_only/);
  });

  it("is applied by every production schema push", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["db:push:prod"]).toMatch(/prisma db push && npm run db:guards$/);
    expect(pkg.scripts["db:guards"]).toBe("tsx scripts/apply-db-guards.ts");
  });
});
