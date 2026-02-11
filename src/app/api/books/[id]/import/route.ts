import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";
import { importUploadSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { convertDocxToMarkdown } from "@/lib/import-export/docx-to-markdown";
import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";

const ALLOWED_EXTENSIONS = [".md", ".txt", ".docx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/import — upload manuscript files and auto-detect chapters. */
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

    const storage = getBookStorage(user.id, bookId);
    const docService = new DocumentService(user.id, bookId);
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
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/books/:id/import error:", error);
    return NextResponse.json(
      { error: "Import failed" },
      { status: 500 }
    );
  }
}
