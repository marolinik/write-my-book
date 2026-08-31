/**
 * Script to verify dynamic numbers displayed in the UI against actual database values.
 * Checks chapter counts, status tallies, word counts, and other dynamic displays.
 * 
 * Run: npx tsx scripts/check-dynamic-numbers.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("=== Checking Dynamic Numbers in Database ===\n");

  // Get all series with their books and chapters
  const series = await db.series.findMany({
    include: {
      books: {
        include: {
          chapters: true,
          documents: true,
          editFindings: true,
          _count: {
            select: {
              chapters: true,
              documents: true,
            },
          },
        },
      },
    },
  });

  console.log(`Found ${series.length} series in database\n`);

  for (const s of series) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`SERIES: ${s.title} (${s.seriesType})`);
    console.log(`ID: ${s.id}`);
    console.log(`${"=".repeat(60)}`);

    const books = s.books;
    console.log(`\nBooks: ${books.length} / ${s.plannedBooks} planned`);

    let totalWords = 0;
    let totalChapters = 0;

    for (const book of books) {
      console.log(`\n  BOOK: ${book.name} (Book #${book.bookNumber})`);
      console.log(`  ID: ${book.id}`);
      console.log(`  Status: ${book.status}`);
      console.log(`  Word Count (stored): ${book.wordCount.toLocaleString()}`);
      console.log(`  Target Word Count: ${book.targetWordCount?.toLocaleString() ?? "not set"}`);

      const chapters = book.chapters;
      totalChapters += chapters.length;
      totalWords += book.wordCount;

      console.log(`  Chapters: ${chapters.length}`);

      if (chapters.length > 0) {
        // Tally chapter statuses
        const statusCounts: Record<string, number> = {};
        let calculatedWordCount = 0;

        for (const ch of chapters) {
          statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
          calculatedWordCount += ch.wordCount;
        }

        console.log(`  Chapter Status Tally:`);
        for (const [status, count] of Object.entries(statusCounts)) {
          console.log(`    - ${status}: ${count}`);
        }

        // Calculate the same numbers the UI would show
        const draftedPlus =
          (statusCounts["drafted"] ?? 0) +
          (statusCounts["dev_edited"] ?? 0) +
          (statusCounts["line_edited"] ?? 0) +
          (statusCounts["beta_read"] ?? 0) +
          (statusCounts["beta_passed"] ?? 0);

        const editedPlus =
          (statusCounts["dev_edited"] ?? 0) +
          (statusCounts["line_edited"] ?? 0) +
          (statusCounts["beta_read"] ?? 0) +
          (statusCounts["beta_passed"] ?? 0);

        const total = chapters.length;
        const pctDrafted = total > 0 ? Math.round((draftedPlus / total) * 100) : 0;
        const pctEdited = total > 0 ? Math.round((editedPlus / total) * 100) : 0;

        console.log(`\n  UI Numbers (as would be displayed):`);
        console.log(`    - Drafted: ${draftedPlus}/${total} (${pctDrafted}%)`);
        console.log(`    - Edited: ${editedPlus}/${total} (${pctEdited}%)`);
        console.log(`    - Total Words (from chapters): ${calculatedWordCount.toLocaleString()}`);
        console.log(`    - Total Words (stored on book): ${book.wordCount.toLocaleString()}`);

        if (calculatedWordCount !== book.wordCount) {
          console.log(`    ⚠️  WARNING: Word count mismatch! Stored=${book.wordCount}, Calculated=${calculatedWordCount}`);
        }

        // Check pending findings
        const pendingFindings = book.editFindings.filter(f => f.status === "pending").length;
        console.log(`    - Pending Findings: ${pendingFindings}`);

        // Check documents
        console.log(`    - Documents: ${book.documents.length}`);
        const docTypes = new Set(book.documents.map(d => d.type));
        console.log(`    - Document Types: ${Array.from(docTypes).join(", ")}`);
      }
    }

    console.log(`\nSeries Totals:`);
    console.log(`  - Total Books: ${books.length}`);
    console.log(`  - Total Chapters: ${totalChapters}`);
    console.log(`  - Total Words: ${totalWords.toLocaleString()}`);
  }

  // Now check specific UI component logic
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("CHECKING UI COMPONENT LOGIC");
  console.log(`${"=".repeat(60)}`);

  // Check the shelf card subtitle logic
  console.log("\n1. Shelf Card Subtitle Logic (card-subtitle.ts):");
  console.log("   The subtitle shows: words · drafted X/Y · last touched N days ago");
  console.log("   For 'currentlyWriting' books with chapters");

  // Check the sidebar logic
  console.log("\n2. Sidebar Logic (app-sidebar.tsx):");
  console.log("   - Setup: X/5 (countSetupStepsDone/SETUP_STEP_TOTAL)");
  console.log("   - Chapters: draftedPlus/total");
  console.log("   - Editorial: editedPlus/total with pending findings badge");
  console.log("   - Reports: reportCount/3");

  // Check the story health dashboard
  console.log("\n3. Story Health Dashboard Logic (story-health-dashboard.tsx):");
  console.log("   - Drafting Progress: draftedPlus/total");
  console.log("   - Editorial Coverage: editedPlus/total");
  console.log("   - Beta Validation: beta_passed/total");

  console.log("\n=== Check Complete ===");
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("Error:", e);
    pool.end();
    process.exit(1);
  });
