/**
 * Fixes the 2 workflow status mismatches found:
 * - Crown of Embers Ch. 1: should be line_edited
 * - Crown of Embers Ch. 5: should be line_edited
 * 
 * Run: npx tsx scripts/fix-workflow-statuses.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("=== Fixing Workflow Status Mismatches ===\n");

  // Fix Ch. 1
  const book1 = await db.book.findFirst({
    where: { name: "Crown of Embers" },
  });

  if (book1) {
    const ch1 = await db.chapter.findFirst({
      where: { bookId: book1.id, chapterNumber: 1 },
    });

    if (ch1 && ch1.status !== "line_edited") {
      await db.chapter.update({
        where: { id: ch1.id },
        data: { status: "line_edited" },
      });
      console.log(`✓ Fixed Ch. 1: ${ch1.status} → line_edited`);
    }
  }

  // Fix Ch. 5
  if (book1) {
    const ch5 = await db.chapter.findFirst({
      where: { bookId: book1.id, chapterNumber: 5 },
    });

    if (ch5 && ch5.status !== "line_edited") {
      await db.chapter.update({
        where: { id: ch5.id },
        data: { status: "line_edited" },
      });
      console.log(`✓ Fixed Ch. 5: ${ch5.status} → line_edited`);
    }
  }

  console.log("\n=== Verification ===\n");

  // Verify the fixes
  const ch1verify = await db.chapter.findFirst({
    where: { bookId: book1!.id, chapterNumber: 1 },
  });
  const ch5verify = await db.chapter.findFirst({
    where: { bookId: book1!.id, chapterNumber: 5 },
  });

  console.log(`Ch. 1 status: ${ch1verify?.status} ${ch1verify?.status === "line_edited" ? "✓" : "⚠️"}`);
  console.log(`Ch. 5 status: ${ch5verify?.status} ${ch5verify?.status === "line_edited" ? "✓" : "⚠️"}`);

  console.log("\n=== Complete ===");
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("Error:", e);
    pool.end();
    process.exit(1);
  });
