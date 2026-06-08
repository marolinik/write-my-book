import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";
import { importUploadSchema, importConfirmRequestSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { convertDocxToMarkdown } from "@/lib/import-export/docx-to-markdown";
import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";
import { indexBatch } from "@/lib/vector";

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
      return handleStructuredImport(req, bookId, user.id);
    }

    // ── Mode 2: Legacy multipart form upload ──
    return handleLegacyImport(req, bookId, user.id);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
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
  const body = await req.json();
  const data = importConfirmRequestSchema.parse(body);

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
        await docService.update(existing.id, ch.content, ch.title, "manual_edit", "import");
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
      const existingDoc = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        ch.number
      );
      if (existingDoc) {
        await docService.update(existingDoc.id, ch.content, ch.title, "manual_edit", "import");
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

      await db.chapter.update({
        where: { bookId_chapterNumber: { bookId, chapterNumber: ch.number } },
        data: {
          title: ch.title,
          wordCount,
          importedAt: new Date(),
        },
      });
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
      metadata: { userId, chapterNumber: ch.number },
    }));
  if (chaptersToIndex.length > 0) {
    indexBatch(chaptersToIndex).catch(err =>
      console.error("[Import] Batch vector indexing failed (non-fatal):", err)
    );
  }

  // Recalculate book stats
  const bookChapters = await db.chapter.findMany({
    where: { bookId },
    select: { wordCount: true },
  });
  const bookWordCount = bookChapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  await db.book.update({
    where: { id: bookId },
    data: {
      chapterCount: bookChapters.length,
      wordCount: bookWordCount,
    },
  });

  return NextResponse.json({
    created: createdCount,
    replaced: replacedCount,
    totalWordCount,
    chapterCount: bookChapters.length,
  });
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

    // Parse chapters
    const chapters = parseManuscriptChapters(content);

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
        await docService.update(existing.id, ch.content, ch.title, "manual_edit", "import");
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

    allChapters = chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      wordCount: ch.wordCount,
    }));

    // Fire-and-forget: batch index imported chapters into vector memory
    const legacyChaptersToIndex = chapters.map((ch) => ({
      bookId,
      docType: "chapter" as const,
      docId: `import-ch-${ch.number}`,
      content: ch.content,
      metadata: { userId, chapterNumber: ch.number },
    }));
    if (legacyChaptersToIndex.length > 0) {
      indexBatch(legacyChaptersToIndex).catch(err =>
        console.error("[Import] Batch vector indexing failed (non-fatal):", err)
      );
    }
  }

  // Update book stats
  await db.book.update({
    where: { id: bookId },
    data: {
      chapterCount: allChapters.length,
      wordCount: totalWordCount,
    },
  });

  return NextResponse.json({
    chapters: allChapters,
    totalWordCount,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
