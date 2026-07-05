/**
 * Dev-only seed for smoke-testing The Shelf (Tier 4.8).
 * Populates all four shelves for the DEV_AUTH_BYPASS user. Idempotent:
 * re-running deletes prior "[seed] " books (cascades chapters/findings) first.
 *
 * Run: npx tsx scripts/dev-seed-shelf.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

interface ChapterSpec {
  n: number;
  status: string;
  words: number;
}
interface BookSpec {
  name: string;
  status: string;
  genre: string;
  words: number;
  archived?: boolean;
  pendingFinding?: boolean;
  chapters: ChapterSpec[];
}

const BOOKS: BookSpec[] = [
  // Currently Writing (no pending findings, active statuses)
  {
    name: "[seed] Ashfall",
    status: "writing",
    genre: "fantasy",
    words: 42000,
    chapters: [
      { n: 1, status: "drafted", words: 3200 },
      { n: 2, status: "drafted", words: 3100 },
      { n: 3, status: "drafted", words: 2900 },
      { n: 4, status: "planned", words: 0 },
      { n: 5, status: "planned", words: 0 },
    ],
  },
  {
    name: "[seed] The Winter Court",
    status: "planning",
    genre: "fantasy",
    words: 3000,
    chapters: [{ n: 1, status: "drafted", words: 3000 }],
  },
  // Waiting for Feedback — one via a pending finding, one via status=beta
  {
    name: "[seed] Saltblood",
    status: "editing",
    genre: "thriller",
    words: 78000,
    pendingFinding: true,
    chapters: [
      { n: 1, status: "dev_edited", words: 4100 },
      { n: 2, status: "dev_edited", words: 4000 },
      { n: 3, status: "dev_edited", words: 3900 },
      { n: 4, status: "dev_edited", words: 4200 },
      { n: 5, status: "drafted", words: 3800 },
      { n: 6, status: "drafted", words: 3700 },
    ],
  },
  {
    name: "[seed] Beta Test Book",
    status: "beta",
    genre: "romance",
    words: 65000,
    chapters: [
      { n: 1, status: "beta_read", words: 3600 },
      { n: 2, status: "beta_read", words: 3500 },
      { n: 3, status: "beta_read", words: 3400 },
    ],
  },
  // Completed — one via status=complete, one via status=export
  {
    name: "[seed] Finished Novel",
    status: "complete",
    genre: "literary",
    words: 90000,
    chapters: [
      { n: 1, status: "beta_passed", words: 4500 },
      { n: 2, status: "beta_passed", words: 4400 },
    ],
  },
  {
    name: "[seed] Shipping Soon",
    status: "export",
    genre: "science fiction",
    words: 85000,
    chapters: [
      { n: 1, status: "beta_passed", words: 4300 },
      { n: 2, status: "beta_passed", words: 4100 },
    ],
  },
  // Archived (wins over its status)
  {
    name: "[seed] Old Draft",
    status: "writing",
    genre: "mystery",
    words: 12000,
    archived: true,
    chapters: [
      { n: 1, status: "drafted", words: 4000 },
      { n: 2, status: "drafted", words: 4000 },
    ],
  },
];

async function main() {
  const clerkId = process.env.DEV_CLERK_ID;
  if (!clerkId) throw new Error("DEV_CLERK_ID not set in .env");

  const user = await db.user.upsert({
    where: { clerkId },
    update: {},
    create: {
      clerkId,
      email: "dev@writemybook.local",
      displayName: process.env.DEV_AUTH_USER_NAME ?? "Dev Writer",
      onboardingComplete: true,
    },
  });
  console.log(`user: ${user.id} (${user.displayName})`);

  const removed = await db.book.deleteMany({
    where: { userId: user.id, name: { startsWith: "[seed] " } },
  });
  console.log(`cleared ${removed.count} prior seed books`);

  for (const spec of BOOKS) {
    const book = await db.book.create({
      data: {
        userId: user.id,
        name: spec.name,
        genre: spec.genre,
        status: spec.status,
        wordCount: spec.words,
        chapterCount: spec.chapters.length,
        archivedAt: spec.archived ? new Date() : null,
        chapters: {
          create: spec.chapters.map((c) => ({
            actNumber: 1,
            chapterNumber: c.n,
            title: `Chapter ${c.n}`,
            status: c.status,
            wordCount: c.words,
          })),
        },
      },
    });

    if (spec.pendingFinding) {
      await db.editFinding.create({
        data: {
          bookId: book.id,
          chapterNumber: 1,
          agentType: "dev-editor",
          severity: "important",
          category: "pacing",
          description: "Tension dips at the midpoint — consider tightening chapter 3.",
          status: "pending",
        },
      });
    }

    const shelf = spec.archived
      ? "Archived"
      : spec.status === "complete" || spec.status === "export"
        ? "Completed"
        : spec.pendingFinding || spec.status === "beta"
          ? "Waiting"
          : "Currently Writing";
    console.log(`  + ${spec.name} → ${shelf} (${spec.chapters.length} ch, ${spec.words}w)`);
  }

  const total = await db.book.count({ where: { userId: user.id } });
  console.log(`done. ${total} total books for this user.`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end();
    process.exit(1);
  });
