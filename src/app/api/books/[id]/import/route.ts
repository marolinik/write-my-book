import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";
import { importUploadSchema, importConfirmRequestSchema } from "@/lib/validation";
import { reconcileBookCounters } from "@/lib/books/book-counters";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { convertDocxToMarkdown } from "@/lib/import-export/docx-to-markdown";
import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";
import {
  findImportProblems,
  type ImportPlanProblems,
} from "@/lib/import-export/import-conflicts";
import { indexBatch } from "@/lib/vector";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

const ALLOWED_EXTENSIONS = [".md", ".txt", ".docx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/books/:id/import
 *
 * Two modes:
 * 1. JSON body with `chapters` array — structured confirm after preview/edit/reorder
 * 2. Multipart form data — legacy direct upload (backward compatible)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") ?? "";

    // ── Mode 1: Structured JSON confirm (from preview → edit → confirm flow) ──
    if (contentType.includes("application/json")) {
      // P6-S05: awaited, so a schema failure reaches the catch below (400 with
      // a body) instead of escaping it as a bare 500 with no body.
      return await handleStructuredImport(req, bookId, user.id);
    }

    // ── Mode 2: Legacy multipart form upload ──
    if (!contentType.includes("multipart/form-data")) {
      // Battery: a bare/unknown body previously fell into req.formData() and
      // answered a raw 500. Answer 400 with the two accepted shapes instead.
      return NextResponse.json(
        {
          error:
            "Unsupported import body — send multipart form data with manuscript files (.md/.txt/.docx), or a JSON body with a chapters array.",
        },
        { status: 400 }
      );
    }
    return handleLegacyImport(req, bookId, user.id);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("POST /api/books/:id/import error:", error);
    return NextResponse.json(
      { error: "Import failed" },
      { status: 500 }
    );
  }
}

/** Handle structured JSON import (post-preview confirm). */
async function handleStructuredImport(
  req: NextRequest,
  bookId: string,
  userId: string
) {
  // A malformed body answers 400, not a raw 500 (D-01). POST's catch has no
  // invalid-JSON branch, so the parse is still guarded here.
  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    throw error;
  }
  const data = importConfirmRequestSchema.parse(body);

  // P6-S04 / P6-S05: check the whole plan before writing anything. `create`
  // used to upsert over the writer's edited chapters, and `replace` of a
  // chapter that does not exist wrote its document before the chapter update
  // threw — an orphan document behind a 500. A bad row now stops the request
  // while nothing has been written.
  const existing = await db.chapter.findMany({
    where: { bookId },
    select: { chapterNumber: true, title: true, wordCount: true },
  });
  const problems = findImportProblems(
    data.chapters,
    existing.map((ch) => ({
      number: ch.chapterNumber,
      title: ch.title,
      wordCount: ch.wordCount,
    }))
  );
  if (problems) {
    return NextResponse.json(
      { error: describeImportProblems(problems), ...problems },
      { status: problems.duplicates.length > 0 ? 400 : 409 }
    );
  }

  const docService = new DocumentService(userId, bookId);
  let createdCount = 0;
  let replacedCount = 0;
  let totalWordCount = 0;

  for (const ch of data.chapters) {
    if (ch.action === "skip") continue;

    const wordCount = ch.content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[#*_~`>|-]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    if (ch.action === "create") {
      await db.chapter.upsert({
        where: { bookId_chapterNumber: { bookId, chapterNumber: ch.number } },
        create: {
          bookId,
          actNumber: data.actNumber,
          chapterNumber: ch.number,
          title: ch.title,
          status: "drafted",
          wordCount,
          importedAt: new Date(),
        },
        update: {
          title: ch.title,
          wordCount,
          status: "drafted",
          importedAt: new Date(),
        },
      });

      const existing = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        ch.number
      );
      if (existing) {
        await docService.update(existing.id, ch.content, ch.title, "import", "import");
      } else {
        await docService.create(
          DocumentType.CHAPTER_CONTENT,
          ch.content,
          ch.title,
          ch.number,
          data.actNumber,
          "import"
        );
      }
      createdCount++;
      totalWordCount += wordCount;
    } else if (ch.action === "replace") {
      // The chapter row first: if it fails, no document has been written.
      await db.chapter.update({
        where: { bookId_chapterNumber: { bookId, chapterNumber: ch.number } },
        data: {
          title: ch.title,
          wordCount,
          importedAt: new Date(),
        },
      });

      const existingDoc = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        ch.number
      );
      if (existingDoc) {
        await docService.update(existingDoc.id, ch.content, ch.title, "import", "import");
      } else {
        await docService.create(
          DocumentType.CHAPTER_CONTENT,
          ch.content,
          ch.title,
          ch.number,
          data.actNumber,
          "import"
        );
      }
      replacedCount++;
      totalWordCount += wordCount;
    }
  }

  // Fire-and-forget: batch index all imported chapters into vector memory
  const chaptersToIndex = data.chapters
    .filter(ch => ch.action !== "skip")
    .map(ch => ({
      bookId,
      docType: "chapter" as const,
      docId: `import-ch-${ch.number}`,
      content: ch.content,
      // D-75: imported chapters ARE chapter content, so flag them — an imported
      // chapter later edited via the content route/document API then converges onto
      // one chunk set instead of duplicating.
      metadata: { userId, chapterNumber: ch.number, chapterContent: true },
    }));
  if (chaptersToIndex.length > 0) {
    indexBatch(chaptersToIndex).catch(err =>
      console.error("[Import] Batch vector indexing failed (non-fatal):", err)
    );
  }

  // Recalculate book stats
  const { chapterCount } = await reconcileBookCounters(bookId);

  return NextResponse.json({
    created: createdCount,
    replaced: replacedCount,
    totalWordCount,
    chapterCount,
  });
}

/** Chapter numbers as "1, 2 and 5". */
function listNumbers(numbers: number[]): string {
  if (numbers.length === 1) return String(numbers[0]);
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/**
 * Why an import plan was refused, in terms an API caller can act on. The JSON
 * confirm can answer with a per-row action; the multipart upload cannot, so it
 * is pointed at the preview flow instead.
 */
function describeImportProblems(
  problems: ImportPlanProblems,
  flow: "json" | "multipart" = "json"
): string {
  const parts: string[] = [];
  const { duplicates, wouldOverwrite, nothingToReplace } = problems;
  const overwriteRemedy =
    flow === "multipart"
      ? "use the import preview to choose which chapters to replace or keep."
      : null;
  if (duplicates.length > 0) {
    parts.push(
      duplicates.length === 1
        ? `Chapter number ${duplicates[0]} is used more than once.`
        : `Chapter numbers ${listNumbers(duplicates)} are each used more than once.`
    );
  }
  if (wouldOverwrite.length > 0) {
    parts.push(
      wouldOverwrite.length === 1
        ? `Chapter ${wouldOverwrite[0]} already holds your work: ${
            overwriteRemedy ?? 'send action "replace" to overwrite it or "skip" to keep it.'
          }`
        : `Chapters ${listNumbers(wouldOverwrite)} already hold your work: ${
            overwriteRemedy ?? 'send action "replace" to overwrite them or "skip" to keep them.'
          }`
    );
  }
  if (nothingToReplace.length > 0) {
    parts.push(
      nothingToReplace.length === 1
        ? `Chapter ${nothingToReplace[0]} does not exist, so there is nothing to replace: send action "create" to add it.`
        : `Chapters ${listNumbers(nothingToReplace)} do not exist, so there is nothing to replace: send action "create" to add them.`
    );
  }
  return `Nothing was imported. ${parts.join(" ")}`;
}

/** Handle legacy multipart form import (backward compatible). */
async function handleLegacyImport(
  req: NextRequest,
  bookId: string,
  userId: string
) {
  const formData = await req.formData();
  const actNumberRaw = formData.get("actNumber");
  const { actNumber } = importUploadSchema.parse({
    actNumber: actNumberRaw ?? undefined,
  });

  const files = formData.getAll("files") as File[];
  // Backwards compat: also check single "file" field
  const singleFile = formData.get("file") as File | null;
  if (singleFile && files.length === 0) {
    files.push(singleFile);
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const storage = getBookStorage(userId, bookId);
  const docService = new DocumentService(userId, bookId);
  const warnings: string[] = [];
  let allChapters: Array<{
    number: number;
    title: string;
    wordCount: number;
  }> = [];
  let totalWordCount = 0;

  // Parse every file before writing anything: the whole upload is checked
  // against the writer's chapters as one plan, like the JSON confirm.
  const parsedFiles: Array<{
    file: File;
    content: string;
    chapters: ReturnType<typeof parseManuscriptChapters>;
  }> = [];
  for (const file of files) {
    // Validate extension
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      warnings.push(`${file.name}: only .md, .txt, and .docx files are allowed`);
      continue;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      warnings.push(`${file.name}: file size exceeds 20MB limit`);
      continue;
    }

    // Get content: convert .docx to markdown, else read as text
    let content: string;
    if (ext === ".docx") {
      const arrayBuffer = await file.arrayBuffer();
      content = await convertDocxToMarkdown(arrayBuffer);
    } else {
      content = await file.text();
    }

    // The parser numbers every file from 1. Files continue where the previous
    // one stopped, as the preview route numbers them, or two files would both
    // claim chapter 1 and the later one overwrite the earlier.
    const offset = parsedFiles.reduce((n, p) => n + p.chapters.length, 0);
    const chapters = parseManuscriptChapters(content).map((ch) => ({
      ...ch,
      number: offset + ch.number,
    }));
    parsedFiles.push({ file, content, chapters });
  }

  // P6-S04, legacy half: this path upserted straight over whatever numbers the
  // parser found, so a manuscript starting at "Chapter 1" reset the writer's
  // edited chapters. It has no per-chapter action, so every row is a `create`,
  // and a plan that would land on the writer's work is refused before a byte
  // is written — the same rule the JSON confirm reads.
  const existing = await db.chapter.findMany({
    where: { bookId },
    select: { chapterNumber: true, title: true, wordCount: true },
  });
  const problems = findImportProblems(
    parsedFiles.flatMap((p) => p.chapters.map((ch) => ({ number: ch.number, action: "create" as const }))),
    existing.map((ch) => ({ number: ch.chapterNumber, title: ch.title, wordCount: ch.wordCount }))
  );
  if (problems) {
    return NextResponse.json(
      { error: describeImportProblems(problems, "multipart"), ...problems },
      { status: problems.duplicates.length > 0 ? 400 : 409 }
    );
  }

  for (const { file, content, chapters } of parsedFiles) {
    // Save imported file to storage
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const importedName = safeName.replace(/\.docx$/i, ".md");
    await storage.write(`manuscript/imported/${importedName}`, content);

    // Create Chapter + Document records for each detected chapter
    for (const ch of chapters) {
      // Upsert chapter record
      await db.chapter.upsert({
        where: { bookId_chapterNumber: { bookId, chapterNumber: ch.number } },
        create: {
          bookId,
          actNumber,
          chapterNumber: ch.number,
          title: ch.title,
          status: "drafted",
          wordCount: ch.wordCount,
          importedAt: new Date(),
        },
        update: {
          title: ch.title,
          wordCount: ch.wordCount,
          status: "drafted",
          importedAt: new Date(),
        },
      });

      // Create or update Document record via DocumentService
      const existing = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        ch.number
      );
      if (existing) {
        await docService.update(existing.id, ch.content, ch.title, "import", "import");
      } else {
        await docService.create(
          DocumentType.CHAPTER_CONTENT,
          ch.content,
          ch.title,
          ch.number,
          actNumber,
          "import"
        );
      }

      totalWordCount += ch.wordCount;
    }

    allChapters = [
      ...allChapters,
      ...chapters.map((ch) => ({ number: ch.number, title: ch.title, wordCount: ch.wordCount })),
    ];

    // Fire-and-forget: batch index imported chapters into vector memory
    const legacyChaptersToIndex = chapters.map((ch) => ({
      bookId,
      docType: "chapter" as const,
      docId: `import-ch-${ch.number}`,
      content: ch.content,
      // D-75: imported chapters ARE chapter content (see structured-import path).
      metadata: { userId, chapterNumber: ch.number, chapterContent: true },
    }));
    if (legacyChaptersToIndex.length > 0) {
      indexBatch(legacyChaptersToIndex).catch(err =>
        console.error("[Import] Batch vector indexing failed (non-fatal):", err)
      );
    }
  }

  // D-200: recount from the chapter rows instead of storing this import's own
  // tallies. `allChapters` only holds the LAST file's chapters and
  // `totalWordCount` only the imported words, so a multi-file import — or an
  // import into a book that already had chapters — stored counters that
  // described neither the book nor the import.
  await reconcileBookCounters(bookId);

  return NextResponse.json({
    chapters: allChapters,
    totalWordCount,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
