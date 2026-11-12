// P2-70 (Wave 5 Task 11): "a deleted book takes its writer memories with it"
// was verified only by matching prisma/schema.prisma text
// (book-delete-cleanup.test.ts). This asks Prisma's own compiler for the DDL
// it would create and checks the foreign keys it actually emits, so a schema
// that reads right but compiles differently cannot pass.
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
let ddl = "";

beforeAll(() => {
  ddl = execFileSync(
    process.execPath,
    [join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "diff", "--from-empty", "--to-schema", join(ROOT, "prisma", "schema.prisma"), "--script"],
    { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 120_000 }
  );
}, 150_000);

function foreignKey(table: string, column: string): string | undefined {
  return ddl
    .split(/\r?\n/)
    .find((line) => line.startsWith(`ALTER TABLE "${table}"`) && line.includes(`FOREIGN KEY ("${column}")`));
}

describe("the compiled schema's delete rules", () => {
  it("compiles", () => {
    expect(ddl).toContain('CREATE TABLE "writer_memories"');
  });

  it("deleting a book deletes its writer memories (they never become global rules)", () => {
    expect(foreignKey("writer_memories", "book_id")).toMatch(/REFERENCES "books"\("id"\) ON DELETE CASCADE/);
  });

  it("deleting a user deletes their writer memories", () => {
    expect(foreignKey("writer_memories", "user_id")).toMatch(/REFERENCES "users"\("id"\) ON DELETE CASCADE/);
  });

  it("deleting a finding keeps the memory it produced, unlinked", () => {
    expect(foreignKey("writer_memories", "finding_id")).toMatch(/ON DELETE SET NULL/);
  });
});
