/**
 * Fixes chapter statuses based on editorial work that was actualy done.
 * Updates "drafted" chapters to "dev_edited", "line_edited", etc.
 * based on the documents and findings that exist.
 * 
 * Run: npx tsx scripts/fix-chapter-statuses.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("=== Fixing Chapter Statuses ===\n");

  // Get all books with their chapters
  const books = await db.book.findMany({
    include: {
      chapters: true,
    },
  });

  console.log(`Checking ${books.length} books...\n`);

  let totalUpdated = 0;

  for (const book of books) {
    const bookName = book.name;
    let bookUpdated = 0;

    for (const chapter of book.chapters) {
      const currentStatus = chapter.status;
      let newStatus = currentStatus;

      // Check what editorial work was done based on documents
      // Query chapter-scoped documents
      const chDocs = await db.document.findMany({
        where: {
          bookId: book.id,
          chapterNumber: chapter.chapterNumber,
        },
      });

      const hasDevEditReport = chDocs.some(d => d.type === "DEV_EDIT_REPORT");
      const hasLineEditReport = chDocs.some(d => d.type === "LINE_EDIT_REPORT");
      const hasBetaReadReport = chDocs.some(d => d.type === "BETA_READ_REPORT");

      // Check edit findings for this chapter
      const findings = await db.editFinding.findMany({
        where: {
          bookId: book.id,
          chapterNumber: chapter.chapterNumber,
        },
      });

      const hasFindings = findings.length > 0;
      const hasAppliedFindings = findings.some(f => f.status === "applied");

      // Determine the appropriate status
      // Priority: beta_passed > beta_read > line_edited > dev_edited > drafted
      if (hasBetaReadReport) {
        // Check if beta_score indicates pass
        if (chapter.betaScore && chapter.betaScore >= 7) {
          newStatus = "beta_passed";
        } else if (chapter.betaGate === "passed") {
          newStatus = "beta_passed";
        } else {
          newStatus = "beta_read";
        }
      } else if (hasLineEditReport || hasAppliedFindings) {
        newStatus = "line_edited";
      } else if (hasDevEditReport || hasFindings) {
        newStatus = "dev_edited";
      }

      // Only update if status needs to change
      if (newStatus !== currentStatus) {
        await db.chapter.update({
          where: { id: chapter.id },
          data: { status: newStatus },
        });

        console.log(`  [${bookName}] Ch. ${chapter.chapterNumber}: ${currentStatus} → ${newStatus}`);
        bookUpdated++;
        totalUpdated++;
      }
    }

    if (bookUpdated > 0) {
      console.log(`  → Updated ${bookUpdated} chapters in "${bookName}"\n`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total chapters updated: ${totalUpdated}`);

  if (totalUpdated > 0) {
    console.log(`\n✓ Chapter statuses have been fixed!`);
    console.log(`The UI should now show correct "edited" counts.`);
  } else {
    console.log(`\nNo chapters needed status updates.`);
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("Error:", e);
    pool.end();
    process.exit(1);
  });
