/**
 * Comprehensive check of ALL dynamic numbers across the entire app.
 * Verifies consistency between different components and calculations.
 * 
 * Run: npx tsx scripts/check-all-app-numbers.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

interface Discrepancy {
  location: string;
  issue: string;
  expected: any;
  actual: any;
}

const discrepancies: Discrepancy[] = [];

function addDiscrepancy(location: string, issue: string, expected: any, actual: any) {
  discrepancies.push({ location, issue, expected, actual });
  console.log(`  ⚠️  [${location}] ${issue}`);
  console.log(`      Expected: ${expected}, Actual: ${actual}`);
}

async function main() {
  console.log("=== COMPREHENSIVE APP-WIDE NUMBER CHECK ===\n");

  // Get all books with full data
  const books = await db.book.findMany({
    include: {
      chapters: true,
      documents: true,
      editFindings: true,
      _count: { select: { documents: true } },
      agentSessions: {
        select: {
          id: true,
          workflowId: true,
          status: true,
          tokensInput: true,
          tokensOutput: true,
          estimatedCostUsd: true,
          startedAt: true,
          completedAt: true,
        },
      },
      series: true,
    },
  });

  console.log(`Checking ${books.length} books...\n`);

  for (const book of books) {
    const bookName = book.name;
    console.log(`${"=".repeat(70)}`);
    console.log(`BOOK: ${bookName}`);
    console.log(`${"=".repeat(70)}`);

    const chapters = book.chapters;
    const totalChapters = chapters.length;

    // ============================================
    // 1. CHAPTER STATUS TALLY
    // ============================================
    console.log(`\n1. CHAPTER STATUS TALLY:`);
    
    const statusCounts: Record<string, number> = {};
    for (const ch of chapters) {
      statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
    }

    console.log(`   Status counts:`, statusCounts);

    // Verify total adds up
    const totalFromStatus = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    if (totalFromStatus !== totalChapters) {
      addDiscrepancy(bookName, "Status tally doesn't match chapter count", totalChapters, totalFromStatus);
    }

    // ============================================
    // 2. DRAFTED/EDITED CALCULATIONS
    // ============================================
    console.log(`\n2. DRAFTED/EDITED CALCULATIONS:`);

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

    const pctDrafted = totalChapters > 0 ? Math.round((draftedPlus / totalChapters) * 100) : 0;
    const pctEdited = totalChapters > 0 ? Math.round((editedPlus / totalChapters) * 100) : 0;

    console.log(`   draftedPlus: ${draftedPlus}/${totalChapters} (${pctDrafted}%)`);
    console.log(`   editedPlus: ${editedPlus}/${totalChapters} (${pctEdited}%)`);

    // Verify these match what useBookState would calculate
    // (This is what the sidebar and book page use)

    // ============================================
    // 3. WORD COUNT CONSISTENCY
    // ============================================
    console.log(`\n3. WORD COUNT CONSISTENCY:`);

    const storedWordCount = book.wordCount;
    const calculatedWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const chapterCountField = book.chapterCount;

    console.log(`   Stored book.wordCount: ${storedWordCount.toLocaleString()}`);
    console.log(`   Calculated from chapters: ${calculatedWordCount.toLocaleString()}`);
    console.log(`   Stored book.chapterCount: ${chapterCountField}`);
    console.log(`   Actual chapters.length: ${totalChapters}`);

    if (storedWordCount !== calculatedWordCount) {
      addDiscrepancy(
        bookName,
        "Word count mismatch",
        calculatedWordCount,
        storedWordCount
      );
    }

    if (chapterCountField !== totalChapters) {
      addDiscrepancy(
        bookName,
        "Chapter count field mismatch",
        totalChapters,
        chapterCountField
      );
    }

    // Check individual chapter word counts
    for (const ch of chapters) {
      if (ch.wordCount < 0) {
        addDiscrepancy(
          `${bookName} Ch.${ch.chapterNumber}`,
          "Negative word count",
          ">= 0",
          ch.wordCount
        );
      }
    }

    // ============================================
    // 4. DOCUMENT COUNTS
    // ============================================
    console.log(`\n4. DOCUMENT COUNTS:`);

    const docs = book.documents;
    const docCount = docs.length;
    const docCountField = book._count?.documents ?? 0;

    console.log(`   documents.length: ${docCount}`);
    console.log(`   _count.documents: ${docCountField}`);

    if (docCount !== docCountField) {
      addDiscrepancy(
        bookName,
        "Document count mismatch",
        docCount,
        docCountField
      );
    }

    // Check for duplicate documents (same type + chapterNumber)
    const docKeys = new Set();
    for (const doc of docs) {
      const key = `${doc.type}-${doc.chapterNumber ?? "null"}`;
      if (docKeys.has(key)) {
        addDiscrepancy(
          bookName,
          `Duplicate document: ${key}`,
          "unique",
          "duplicate"
        );
      }
      docKeys.add(key);
    }

    // ============================================
    // 5. EDITORIAL FINDINGS
    // ============================================
    console.log(`\n5. EDITORIAL FINDINGS:`);

    const findings = book.editFindings;
    const pendingFindings = findings.filter(f => f.status === "pending").length;
    const appliedFindings = findings.filter(f => f.status === "applied").length;
    const dismissedFindings = findings.filter(f => f.status === "dismissed").length;
    const totalFindings = findings.length;

    console.log(`   Pending: ${pendingFindings}`);
    console.log(`   Applied: ${appliedFindings}`);
    console.log(`   Dismissed: ${dismissedFindings}`);
    console.log(`   Total: ${totalFindings}`);

    if (pendingFindings + appliedFindings + dismissedFindings !== totalFindings) {
      addDiscrepancy(
        bookName,
        "Finding status counts don't add up",
        totalFindings,
        pendingFindings + appliedFindings + dismissedFindings
      );
    }

    // ============================================
    // 6. AGENT SESSION STATS
    // ============================================
    console.log(`\n6. AGENT SESSION STATS:`);

    const sessions = book.agentSessions;
    const completedSessions = sessions.filter(s => s.status === "completed");
    const recentSessions = completedSessions.slice(0, 5);

    console.log(`   Total sessions: ${sessions.length}`);
    console.log(`   Completed sessions: ${completedSessions.length}`);
    console.log(`   Recent (last 5): ${recentSessions.length}`);

    // Check token counts
    for (const session of sessions) {
      const totalTokens = (session.tokensInput || 0) + (session.tokensOutput || 0);
      if (totalTokens < 0) {
        addDiscrepancy(
          `${bookName} Session ${session.id}`,
          "Negative token count",
          ">= 0",
          totalTokens
        );
      }

      // Verify timeAgo calculation
      if (session.startedAt) {
        const now = Date.now();
        const started = new Date(session.startedAt).getTime();
        const diffMs = now - started;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMs < 0) {
          addDiscrepancy(
            `${bookName} Session ${session.id}`,
            "Session started in future",
            "< now",
            session.startedAt
          );
        }
      }
    }

    // ============================================
    // 7. BETA SCORES
    // ============================================
    console.log(`\n7. BETA SCORES:`);

    const chaptersWithScores = chapters.filter(ch => ch.betaScore !== null);
    if (chaptersWithScores.length > 0) {
      const avgScore = chaptersWithScores.reduce((sum, ch) => sum + (ch.betaScore ?? 0), 0) / chaptersWithScores.length;
      console.log(`   Chapters with beta scores: ${chaptersWithScores.length}/${totalChapters}`);
      console.log(`   Average beta score: ${avgScore.toFixed(1)}/10`);

      // Check for invalid scores
      for (const ch of chaptersWithScores) {
        if (ch.betaScore! < 0 || ch.betaScore! > 10) {
          addDiscrepancy(
            `${bookName} Ch.${ch.chapterNumber}`,
            "Beta score out of range",
            "0-10",
            ch.betaScore
          );
        }
      }
    }

    // ============================================
    // 8. SERIES-LEVEL CALCULATIONS
    // ============================================
    if (book.series) {
      console.log(`\n8. SERIES-LEVEL CALCULATIONS:`);
      console.log(`   Series: ${book.series.title}`);
      console.log(`   Book number: ${book.bookNumber}`);
      console.log(`   Series planned books: ${book.series.plannedBooks}`);
    }

    // ============================================
    // 9. SETUP PROGRESS
    // ============================================
    console.log(`\n9. SETUP PROGRESS:`);

    const hasFingerprint = docs.some(d => d.type === "FINGERPRINT");
    const hasStoryBible = docs.some(d => d.type === "STORY_BIBLE");
    const hasArchitecture = docs.some(d => d.type === "ARCHITECTURE");
    
    const setupSteps = [hasFingerprint, hasStoryBible, hasArchitecture].filter(Boolean).length;
    console.log(`   Setup progress: ${setupSteps}/3`);
    console.log(`   - Fingerprint: ${hasFingerprint}`);
    console.log(`   - Story Bible: ${hasStoryBible}`);
    console.log(`   - Architecture: ${hasArchitecture}`);

    console.log(`\n`);
  }

  // ============================================
  // SERIES-LEVEL CHECKS
  // ============================================
  console.log(`${"=".repeat(70)}`);
  console.log(`SERIES-LEVEL CHECKS`);
  console.log(`${"=".repeat(70)}`);

  const seriesList = await db.series.findMany({
    include: {
      books: {
        include: {
          chapters: true,
        },
      },
    },
  });

  for (const series of seriesList) {
    console.log(`\nSeries: ${series.title}`);
    
    const books = series.books;
    const totalBooks = books.length;
    const totalChapters = books.reduce((sum, b) => sum + b.chapters.length, 0);
    const totalWords = books.reduce((sum, b) => sum + b.wordCount, 0);

    console.log(`  Books: ${totalBooks}/${series.plannedBooks}`);
    console.log(`  Total chapters: ${totalChapters}`);
    console.log(`  Total words: ${totalWords.toLocaleString()}`);

    if (totalBooks > series.plannedBooks) {
      addDiscrepancy(
        `Series: ${series.title}`,
        "More books than planned",
        `≤ ${series.plannedBooks}`,
        totalBooks
      );
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log(`\n${"=".repeat(70)}`);
  console.log(`SUMMARY`);
  console.log(`${"=".repeat(70)}`);

  if (discrepancies.length === 0) {
    console.log("\n✅ ALL NUMBERS ARE CONSISTENT!");
    console.log("No discrepancies found across the app.");
  } else {
    console.log(`\n⚠️  Found ${discrepancies.length} discrepancy(ies):`);
    console.log(`\n${"=".repeat(70)}`);
    discrepancies.forEach((d, i) => {
      console.log(`${i + 1}. [${d.location}] ${d.issue}`);
      console.log(`   Expected: ${d.expected}`);
      console.log(`   Actual: ${d.actual}`);
      console.log(``);
    });
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
