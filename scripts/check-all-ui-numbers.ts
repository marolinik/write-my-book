/**
 * Comprehensive check of ALL dynamic numbers displayed in the UI.
 * Verifies calculations against actual database values.
 * 
 * Run: npx tsx scripts/check-all-ui-numbers.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("=== Checking ALL UI Dynamic Numbers ===\n");

  // Get the Legat series
  const series = await db.series.findFirst({
    where: { title: "Legat" },
    include: {
      books: {
        include: {
          chapters: true,
          documents: true,
          editFindings: true,
          agentSessions: {
            select: {
              id: true,
              workflowId: true,
              status: true,
              tokensInput: true,
              tokensOutput: true,
              startedAt: true,
              completedAt: true,
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

  console.log(`Checking series: ${series.title}\n`);

  for (const book of series.books) {
    console.log(`${"=".repeat(70)}`);
    console.log(`BOOK: ${book.name}`);
    console.log(`${"=".repeat(70)}`);

    const chapters = book.chapters;
    const totalChapters = chapters.length;

    // Calculate status tallies
    const statusCounts: Record<string, number> = {};
    for (const ch of chapters) {
      statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
    }

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

    // UI Calculations (from book page)
    const pctDrafted = totalChapters > 0 ? Math.round((draftedPlus / totalChapters) * 100) : 0;
    const pctEdited = totalChapters > 0 ? Math.round((editedPlus / totalChapters) * 100) : 0;
    const pctPassed = totalChapters > 0 ? Math.round((betaPassedCount / totalChapters) * 100) : 0;

    console.log(`\n1. BOOK OVERVIEW PAGE:`);
    console.log(`   Word Count: ${book.wordCount.toLocaleString()}`);
    console.log(`   Chapters: ${totalChapters}`);
    console.log(`   Drafted: ${draftedPlus}/${totalChapters} (${pctDrafted}%)`);
    console.log(`   Edited: ${editedPlus}/${totalChapters} (${pctEdited}%)`);
    console.log(`   Beta Passed: ${betaPassedCount}/${totalChapters} (${pctPassed}%)`);

    // Average beta score
    const chaptersWithScores = chapters.filter(ch => ch.betaScore !== null);
    if (chaptersWithScores.length > 0) {
      const avgBetaScore = (
        chaptersWithScores.reduce((sum, ch) => sum + (ch.betaScore ?? 0), 0) /
        chaptersWithScores.length
      ).toFixed(1);
      console.log(`   Avg Beta Score: ${avgBetaScore}/10`);
    }

    // Pending findings
    const pendingFindings = book.editFindings.filter(f => f.status === "pending").length;
    console.log(`   Pending Findings: ${pendingFindings}`);

    // Documents count
    console.log(`   Documents: ${book.documents.length}`);

    // Recent agent sessions
    const recentSessions = book.agentSessions
      .filter(s => s.status === "completed")
      .slice(0, 5);
    console.log(`   Recent Sessions: ${recentSessions.length}`);

    console.log(`\n2. SIDEBAR NUMBERS:`);
    
    // Setup progress
    const hasFingerprint = book.documents.some(d => d.type === "FINGERPRINT");
    const hasStoryBible = book.documents.some(d => d.type === "STORY_BIBLE");
    const hasArchitecture = book.documents.some(d => d.type === "ARCHITECTURE");
    const setupSteps = [hasFingerprint, hasStoryBible, hasArchitecture].filter(Boolean).length;
    
    console.log(`   Setup: ${setupSteps}/3`);
    console.log(`   Chapters: ${draftedPlus}/${totalChapters}`);
    console.log(`   Editorial: ${editedPlus}/${totalChapters}`);
    console.log(`   Pending Findings Badge: ${pendingFindings > 0 ? pendingFindings : "none"}`);

    // Reports count
    const hasAnalysisReport = book.documents.some(d => d.type === "ANALYSIS_REPORT");
    const hasContinuityReport = book.documents.some(d => d.type === "CONTINUITY_REPORT");
    const hasMarketReport = book.documents.some(d => d.type === "MARKET_REPORT");
    const reportCount = [hasAnalysisReport, hasContinuityReport, hasMarketReport].filter(Boolean).length;
    console.log(`   Reports: ${reportCount}/3`);

    console.log(`\n3. STORY HEALTH DASHBOARD:`);
    console.log(`   Drafting Progress: ${draftedPlus}/${totalChapters}`);
    console.log(`   Editorial Coverage: ${editedPlus}/${totalChapters}`);
    console.log(`   Beta Validation: ${betaPassedCount}/${totalChapters}`);
    console.log(`   Findings Health: ${pendingFindings === 0 ? "No unreviewed findings" : `${pendingFindings} findings need review`}`);

    console.log(`\n4. SHELF CARD SUBTITLE (if on shelf):`);
    // Assuming this is in "currentlyWriting" shelf
    const words = `${book.wordCount.toLocaleString()}`;
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(book.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const lastTouched = daysSinceUpdate <= 0 ? "today" : daysSinceUpdate === 1 ? "yesterday" : `${daysSinceUpdate} days ago`;
    
    if (totalChapters > 0) {
      console.log(`   "${words} · drafted ${draftedPlus}/${totalChapters} · last touched ${lastTouched}"`);
    } else {
      console.log(`   "${words} · not started · created ${lastTouched}"`);
    }

    console.log(`\n`);
  }

  // Series-level numbers
  console.log(`${"=".repeat(70)}`);
  console.log("SERIES PAGE NUMBERS:");
  console.log(`${"=".repeat(70)}`);

  const totalBooks = series.books.length;
  const totalChapters = series.books.reduce((sum, b) => sum + b.chapters.length, 0);
  const totalWords = series.books.reduce((sum, b) => sum + b.wordCount, 0);

  console.log(`Total Books: ${totalBooks}`);
  console.log(`Total Chapters: ${totalChapters}`);
  console.log(`Total Words: ${totalWords.toLocaleString()}`);

  // Check for data discrepancies
  console.log(`\n${"=".repeat(70)}`);
  console.log("CHECKING FOR DISCREPANCIES:");
  console.log(`${"=".repeat(70)}`);

  let discrepancies = 0;

  for (const book of series.books) {
    // Check word count consistency
    const calculatedWordCount = book.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    if (calculatedWordCount !== book.wordCount) {
      console.log(`⚠️  ${book.name}: Word count mismatch!`);
      console.log(`    Stored: ${book.wordCount}, Calculated: ${calculatedWordCount}`);
      discrepancies++;
    }

    // Check chapter count consistency
    if (book.chapterCount !== book.chapters.length) {
      console.log(`⚠️  ${book.name}: Chapter count mismatch!`);
      console.log(`    Stored: ${book.chapterCount}, Actual: ${book.chapters.length}`);
      discrepancies++;
    }
  }

  if (discrepancies === 0) {
    console.log("✓ No discrepancies found!");
  } else {
    console.log(`\nFound ${discrepancies} discrepancy(ies).`);
  }

  console.log(`\n=== Check Complete ===`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("Error:", e);
    pool.end();
    process.exit(1);
  });
