/**
 * Checks if workflow statuses are correctly applied to chapters.
 * Verifies:
 * 1. Workflow-to-status mapping is correct
 * 2. Chapters have correct status after workflow completion
 * 3. No mismatches between expected and actual statuses
 * 
 * Run: npx tsx scripts/check-workflow-statuses.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log("=== Checking Workflow Status Consistency ===\n");

  // 1. Get the expected workflow → status mapping from post-session.ts
  const WORKFLOW_STATUS_MAP = {
    "dev-edit": "dev_edited",
    "line-edit": "line_edited",
    "beta-read": "beta_read",
    "write-chapter": "drafted",
    "plan-chapter": "planned",
    "discuss-chapter": "discussed",
  };

  console.log("1. Expected Workflow → Status Mapping:");
  for (const [workflow, status] of Object.entries(WORKFLOW_STATUS_MAP)) {
    console.log(`   ${workflow} → ${status}`);
  }

  // 2. Get all completed agent sessions with their chapters
  const sessions = await db.agentSession.findMany({
    where: {
      status: "completed",
      workflowId: { in: Object.keys(WORKFLOW_STATUS_MAP) },
    },
    include: {
      book: {
        include: {
          chapters: true,
        },
      },
    },
  });

  console.log(`\n2. Checking ${sessions.length} completed workflow sessions...\n`);

  let mismatches = 0;
  let correctStatuses = 0;
  const issues: Array<{ sessionId: string; bookName: string; chapterNumber: number; workflowId: string; expectedStatus: string; actualStatus: string }> = [];

  for (const session of sessions) {
    const book = session.book;
    const chapterNumber = session.chapterNumber;
    const workflowId = session.workflowId;

    if (!chapterNumber || !workflowId) continue;

    // Find the chapter
    const chapter = book.chapters.find(ch => ch.chapterNumber === chapterNumber);
    if (!chapter) {
      console.log(`  ⚠️  Session ${session.id}: Chapter ${chapterNumber} not found in book ${book.name}`);
      continue;
    }

    // Expected status
    const expectedStatus = WORKFLOW_STATUS_MAP[workflowId as keyof typeof WORKFLOW_STATUS_MAP];
    if (!expectedStatus) continue;

    // Check if status matches
    const actualStatus = chapter.status;

    if (actualStatus !== expectedStatus) {
      // Status might have advanced further (e.g., dev-edit → line-edit)
      // Check if it's at least the expected status or beyond
      const statusOrder = ["undiscussed", "discussed", "planned", "drafted", "dev_edited", "line_edited", "beta_read", "beta_passed"];
      const expectedIdx = statusOrder.indexOf(expectedStatus);
      const actualIdx = statusOrder.indexOf(actualStatus);

      if (actualIdx < expectedIdx) {
        // Status is behind where it should be
        mismatches++;
        issues.push({
          sessionId: session.id,
          bookName: book.name,
          chapterNumber,
          workflowId,
          expectedStatus,
          actualStatus,
        });

        console.log(`  ⚠️  [${book.name}] Ch. ${chapterNumber}:`);
        console.log(`      Workflow: ${workflowId}`);
        console.log(`      Expected status: ${expectedStatus}`);
        console.log(`      Actual status: ${actualStatus}`);
        console.log(`      Session: ${session.id}\n`);
      }
    } else {
      correctStatuses++;
    }
  }

  // 3. Check for chapters with editorial documents but wrong status
  console.log("\n3. Checking chapters with editorial documents...");

  const books = await db.book.findMany({
    include: {
      chapters: true,
      documents: true,
    },
  });

  let docStatusMismatches = 0;

  for (const book of books) {
    for (const chapter of book.chapters) {
      // Get chapter-scoped documents
      const chDocs = await db.document.findMany({
        where: {
          bookId: book.id,
          chapterNumber: chapter.chapterNumber,
        },
      });

      const hasDevEditReport = chDocs.some(d => d.type === "DEV_EDIT_REPORT");
      const hasLineEditReport = chDocs.some(d => d.type === "LINE_EDIT_REPORT");
      const hasBetaReadReport = chDocs.some(d => d.type === "BETA_READ_REPORT");

      // Check if status matches documents
      if (hasBetaReadReport && chapter.status !== "beta_read" && chapter.status !== "beta_passed") {
        console.log(`  ⚠️  [${book.name}] Ch. ${chapter.chapterNumber}: Has BETA_READ_REPORT but status is "${chapter.status}"`);
        docStatusMismatches++;
      } else if (hasLineEditReport && chapter.status !== "line_edited" && chapter.status !== "beta_read" && chapter.status !== "beta_passed") {
        console.log(`  ⚠️  [${book.name}] Ch. ${chapter.chapterNumber}: Has LINE_EDIT_REPORT but status is "${chapter.status}"`);
        docStatusMismatches++;
      } else if (hasDevEditReport && chapter.status === "drafted") {
        console.log(`  ⚠️  [${book.name}] Ch. ${chapter.chapterNumber}: Has DEV_EDIT_REPORT but status is "drafted"`);
        docStatusMismatches++;
      }
    }
  }

  // 4. Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(70)}`);

  console.log(`\nWorkflow Status Check:`);
  console.log(`  - Sessions checked: ${sessions.length}`);
  console.log(`  - Correct statuses: ${correctStatuses}`);
  console.log(`  - Mismatches: ${mismatches}`);

  console.log(`\nDocument-Status Consistency:`);
  console.log(`  - Mismatches: ${docStatusMismatches}`);

  if (mismatches === 0 && docStatusMismatches === 0) {
    console.log(`\n✅ All workflow statuses are correct!`);
  } else {
    console.log(`\n⚠️  Found ${mismatches + docStatusMismatches} issue(s) to fix.`);
  }

  // 5. Show the LEGAT series specifically
  console.log(`\n${"=".repeat(70)}`);
  console.log("LEGAT SERIES STATUS CHECK:");
  console.log(`${"=".repeat(70)}`);

  const legatSeries = await db.series.findFirst({
    where: { title: "Legat" },
    include: {
      books: {
        include: {
          chapters: true,
          documents: true,
        },
      },
    },
  });

  if (legatSeries) {
    for (const book of legatSeries.books) {
      console.log(`\n  Book: ${book.name}`);
      
      for (const chapter of book.chapters) {
        // Documents hang off the book (unique [bookId, type, chapterNumber]),
        // so select this chapter's docs by number.
        const chDocs = book.documents.filter(
          (d) => d.chapterNumber === chapter.chapterNumber
        );
        const hasDevEdit = chDocs.some((d) => d.type === "DEV_EDIT_REPORT");
        const hasLineEdit = chDocs.some((d) => d.type === "LINE_EDIT_REPORT");
        const hasBetaRead = chDocs.some((d) => d.type === "BETA_READ_REPORT");

        const expectedStatus = hasBetaRead ? "beta_read/beta_passed" : hasLineEdit ? "line_edited" : hasDevEdit ? "dev_edited" : "drafted";
        
        if (chapter.status !== expectedStatus.replace(/\/.*$/, "") && !expectedStatus.includes(chapter.status)) {
          console.log(`    ⚠️  Ch. ${chapter.chapterNumber}: status="${chapter.status}" but has editorial docs (expected: ${expectedStatus})`);
        } else {
          console.log(`    ✓ Ch. ${chapter.chapterNumber}: status="${chapter.status}" ✓`);
        }
      }
    }
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
