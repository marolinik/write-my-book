/**
 * D-16 re-verify (QA, temporary): unique constraint on
 * documents(book_id, type, chapter_number).
 *
 * 1. Assert the unique index exists in the pg catalog.
 * 2. Attempt a duplicate insert of an existing chapter-scoped document row —
 *    expect P2002 (unique violation). If the insert somehow succeeds, the row
 *    is deleted immediately and the script reports FAIL (exit 1).
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const idx: Array<{ indexname: string }> = await db.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'documents' AND indexdef ILIKE '%book_id%type%chapter_number%'
    `;
    console.log(
      `[1] catalog: ${idx.length > 0 ? "PRESENT" : "MISSING"} (${idx.map((i) => i.indexname).join(", ")})`
    );
    if (idx.length === 0) process.exit(1);

    const existing = await db.document.findFirst({
      where: { chapterNumber: { not: null } },
      select: { id: true, bookId: true, type: true, chapterNumber: true },
    });
    if (!existing) {
      console.log("[2] no chapter-scoped document found — cannot test insert");
      process.exit(2);
    }
    console.log(`[2] target group: ${existing.bookId} ${existing.type} ch${existing.chapterNumber}`);

    try {
      const dup = await db.document.create({
        data: {
          bookId: existing.bookId,
          type: existing.type,
          chapterNumber: existing.chapterNumber,
          title: "D16-VERIFY-DUP (should never persist)",
          storageKey: "d16-verify/nonexistent.md",
        },
      });
      await db.document.delete({ where: { id: dup.id } });
      console.log("[3] FAIL: duplicate insert SUCCEEDED (row deleted again)");
      process.exit(1);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "P2002") {
        console.log("[3] PASS: duplicate insert rejected with P2002 unique violation");
        return;
      }
      console.log(`[3] UNEXPECTED error: ${err.code} ${err.message?.slice(0, 200)}`);
      process.exit(1);
    }
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

main();
