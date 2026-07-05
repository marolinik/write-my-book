/**
 * Dev-only seed for smoke-testing 4.3 ambient series awareness.
 * Creates a 2-book series for the DEV_AUTH_BYPASS user (Book 1 = prior, Book 2 = current
 * with a chapter 7). Prints BOOK1_ID / BOOK2_ID for the Neo4j graph seed. Idempotent.
 *
 * Run: npx tsx scripts/dev-seed-series.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const clerkId = process.env.DEV_CLERK_ID;
  if (!clerkId) throw new Error("DEV_CLERK_ID not set");
  const user = await db.user.findUniqueOrThrow({ where: { clerkId } });

  // Idempotent: drop prior seed series + its books (cascade)
  const existing = await db.series.findFirst({
    where: { userId: user.id, title: "[seed] Ember Saga" },
  });
  if (existing) {
    await db.book.deleteMany({ where: { seriesId: existing.id } });
    await db.series.delete({ where: { id: existing.id } });
  }

  const series = await db.series.create({
    data: { userId: user.id, title: "[seed] Ember Saga", seriesType: "TRILOGY", genre: "fantasy" },
  });

  const bk1 = await db.book.create({
    data: {
      userId: user.id,
      seriesId: series.id,
      bookNumber: 1,
      name: "[seed] Ember Saga - Book 1",
      status: "complete",
      genre: "fantasy",
      wordCount: 95000,
    },
  });

  const bk2 = await db.book.create({
    data: {
      userId: user.id,
      seriesId: series.id,
      bookNumber: 2,
      name: "[seed] Ember Saga - Book 2",
      status: "writing",
      genre: "fantasy",
      wordCount: 30000,
      chapters: {
        create: [{ actNumber: 1, chapterNumber: 7, title: "The Council Convenes", status: "drafted", wordCount: 3000 }],
      },
    },
  });

  console.log(`SERIES_ID=${series.id}`);
  console.log(`BOOK1_ID=${bk1.id}`);
  console.log(`BOOK2_ID=${bk2.id}`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
