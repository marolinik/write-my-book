/**
 * Apply the database guards Prisma's schema cannot express (triggers).
 *
 * `prisma db push` neither creates nor removes triggers, so this runs after
 * it, in `db:push:prod` and `db:guards`. The SQL is idempotent.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";

async function main(): Promise<void> {
  const sql = readFileSync(join(__dirname, "db-guards.sql"), "utf8");
  // Postgres runs the whole script as one simple-protocol call; the function
  // bodies contain semicolons inside $$ quoting, so it is not split here.
  await db.$executeRawUnsafe(sql);
  console.log("[db-guards] applied: edit_actions is append-only while its book exists");
}

main()
  .catch((error) => {
    console.error("[db-guards] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
