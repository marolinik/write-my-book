/**
 * Verifies the dynamic numbers displayed for the "Legat" series
 * against the actual database values.
 * 
 * Run: npx tsx scripts/verify-legat-numbers.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("=== Verifying Legat Series Numbers ===\n");

  // Find the Legat series
  const series = await db.series.findFirst({
    where: {
      title: "Legat",
    },
    include: {
      books: {
        include: {
          chapters: true,
          documents: true,
          editFindings: true,
          settings: true,
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

  if (!series) {
    console.log('No series found with title "Legat"');
    return;
  }

  console.log(`Series: ${series.title} (${series.seriesType})`);
  console.log(`ID: ${series.id}`);
  console.log(`Books: ${series.books.length} / ${series.plannedBooks} planned\n`);

  for (const book of series.books) {
    console.log(`${"=".repeat(70)}`);
    console.log(`BOOK: ${book.name} (Book #${book.bookNumber})`);
    console.log(`${"=".repeat(70)}`);
    console.log(`ID: ${book.id}`);
    console.log(`Status: ${book.status}`);
    console.log(`Genre: ${book.genre ?? "not set"}`);
    console.log(`Language: ${book.language}`);
    console.log(`Word Count (stored): ${book.wordCount.toLocaleString()}`);
    console.log(`Target Word Count: ${book.targetWordCount?.toLocaleString() ?? "not set"}`);
    console.log(`Chapter Count (stored): ${book.chapterCount}`);
    console.log(`Created: ${book.createdAt}`);
    console.log(`Updated: ${book.updatedAt}\n`);

    const chapters = book.chapters;
    console.log(`Chapters: ${chapters.length}`);

    if (chapters.length > 0) {
      // Tally chapter statuses
      const statusCounts: Record<string, number> = {};
      let calculatedWordCount = 0;
      let totalBetaScore = 0;
      let chaptersWithBetaScore = 0;

      for (const ch of chapters) {
        statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
        calculatedWordCount += ch.wordCount;
        if (ch.betaScore !== null) {
          totalBetaScore += ch.betaScore;
          chaptersWithBetaScore++;
        }
      }

      console.log(`\nChapter Status Tally:`);
      for (const [status, count] of Object.entries(statusCounts)) {
        console.log(`  - ${status}: ${count}`);
      }

      // Calculate UI numbers
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

      const betaPassedCount = statusCounts["beta_passed"] ?? 0;

      const total = chapters.length;
      const pctDrafted = total > 0 ? Math.round((draftedPlus / total) * 100) : 0;
      const pctEdited = total > 0 ? Math.round((editedPlus / total) * 100) : 0;
      const pctPassed = total > 0 ? Math.round((betaPassedCount / total) * 100) : 0;

      console.log(`\n=== UI Numbers (as displayed on book page) ===`);
      console.log(`Drafted: ${draftedPlus}/${total} (${pctDrafted}%)`);
      console.log(`Edited: ${editedPlus}/${total} (${pctEdited}%)`);
      console.log(`Beta Passed: ${betaPassedCount}/${total} (${pctPassed}%)`);
      console.log(`\nWord Count: ${book.wordCount.toLocaleString()}`);
      console.log(`  - Stored on book: ${book.wordCount}`);
      console.log(`  - Calculated from chapters: ${calculatedWordCount}`);
      
      if (calculatedWordCount !== book.wordCount) {
        console.log(`  ⚠️ MISMATCH! Difference: ${book.wordCount - calculatedWordCount}`);
      }

      // Average beta score
      if (chaptersWithBetaScore > 0) {
        const avgBetaScore = (totalBetaScore / chaptersWithBetaScore).toFixed(1);
        console.log(`\nAverage Beta Score: ${avgBetaScore}/10`);
      }

      // Check pending findings
      const pendingFindings = book.editFindings.filter(f => f.status === "pending").length;
      const appliedFindings = book.editFindings.filter(f => f.status === "applied").length;
      const dismissedFindings = book.editFindings.filter(f => f.status === "dismissed").length;
      
      console.log(`\nEditorial Findings:`);
      console.log(`  - Pending: ${pendingFindings}`);
      console.log(`  - Applied: ${appliedFindings}`);
      console.log(`  - Dismissed: ${dismissedFindings}`);
      console.log(`  - Total: ${book.editFindings.length}`);

      // Check documents
      console.log(`\nDocuments: ${book.documents.length}`);
      const docTypes = new Set(book.documents.map(d => d.type));
      console.log(`Document Types: ${Array.from(docTypes).join(", ")}`);

      // Check setup progress
      const hasFingerprint = docTypes.has("FINGERPRINT");
      const hasStoryBible = docTypes.has("STORY_BIBLE");
      const hasArchitecture = docTypes.has("ARCHITECTURE");
      
      console.log(`\nSetup Progress:`);
      console.log(`  - Basics complete: ${!!(book.name && book.genre)}`);
      console.log(`  - Import complete: ${chapters.length > 0 || (book.settings?.setupImportSkipped ?? false)}`);
      console.log(`  - Style (Fingerprint): ${hasFingerprint}`);
      console.log(`  - Story Bible: ${hasStoryBible}`);
      console.log(`  - Architecture: ${hasArchitecture}`);
      console.log(`  - Setup complete: ${book.settings?.setupComplete ?? false}`);

      const setupSteps = [hasFingerprint, hasStoryBible, hasArchitecture].filter(Boolean).length;
      console.log(`  → Setup: ${setupSteps}/3 (or 5 with basics + import)`);

      // Check "time ago" calculations
      const now = new Date();
      const updatedAt = new Date(book.updatedAt);
      const createdAt = new Date(book.createdAt);
      const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceCreate = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      console.log(`\nTime Calculations:`);
      console.log(`  - Last updated: ${daysSinceUpdate} days ago`);
      console.log(`  - Created: ${daysSinceCreate} days ago`);
      console.log(`  - lastTouched (for shelf): ${daysSinceUpdate} days`);
    }

    console.log(`\n`);
  }

  // Series-level summary
  console.log(`${"=".repeat(70)}`);
  console.log("SERIES SUMMARY");
  console.log(`${"=".repeat(70)}`);

  const totalBooks = series.books.length;
  const totalChapters = series.books.reduce((sum, b) => sum + b.chapters.length, 0);
  const totalWords = series.books.reduce((sum, b) => sum + b.wordCount, 0);
  const totalPendingFindings = series.books.reduce(
    (sum, b) => sum + b.editFindings.filter(f => f.status === "pending").length,
    0
  );

  console.log(`Total Books: ${totalBooks}`);
  console.log(`Total Chapters: ${totalChapters}`);
  console.log(`Total Words: ${totalWords.toLocaleString()}`);
  console.log(`Total Pending Findings: ${totalPendingFindings}`);

  // Check series documents
  const seriesDocs = await db.document.findMany({
    where: { seriesId: series.id },
  });

  console.log(`\nSeries Documents: ${seriesDocs.length}`);
  if (seriesDocs.length > 0) {
    const seriesDocTypes = new Set(seriesDocs.map(d => d.type));
    console.log(`Series Document Types: ${Array.from(seriesDocTypes).join(", ")}`);
  }

  console.log(`\n=== Verification Complete ===`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("Error:", e);
    pool.end();
    process.exit(1);
  });
