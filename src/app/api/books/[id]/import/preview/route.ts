import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { convertDocxToMarkdown } from "@/lib/import-export/docx-to-markdown";
import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";
import type { ImportPreviewChapter } from "@/lib/validation";

const ALLOWED_EXTENSIONS = [".md", ".txt", ".docx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/import/preview — parse uploaded files without persisting. */
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
    const files = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;
    if (singleFile && files.length === 0) {
      files.push(singleFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const warnings: string[] = [];
    const allChapters: ImportPreviewChapter[] = [];
    let globalChapterOffset = 0;

    for (const file of files) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        warnings.push(`${file.name}: only .md, .txt, and .docx files are allowed`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        warnings.push(`${file.name}: file size exceeds 20MB limit`);
        continue;
      }

      let content: string;
      if (ext === ".docx") {
        try {
          const arrayBuffer = await file.arrayBuffer();
          content = await convertDocxToMarkdown(arrayBuffer);
        } catch (err) {
          warnings.push(`${file.name}: failed to parse DOCX — ${(err as Error).message}`);
          continue;
        }
      } else {
        content = await file.text();
      }

      const parsed = parseManuscriptChapters(content);

      for (const ch of parsed) {
        allChapters.push({
          tempId: `${file.name}-${ch.number}`,
          number: globalChapterOffset + ch.number,
          title: ch.title,
          content: ch.content,
          wordCount: ch.wordCount,
          sourceFile: file.name,
        });
      }

      globalChapterOffset += parsed.length;
    }

    // Fetch existing chapters for conflict detection
    const existingChapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
      select: {
        chapterNumber: true,
        title: true,
        wordCount: true,
      },
    });

    return NextResponse.json({
      chapters: allChapters,
      existingChapters: existingChapters.map((ch) => ({
        number: ch.chapterNumber,
        title: ch.title,
        wordCount: ch.wordCount,
      })),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/books/:id/import/preview error:", error);
    return NextResponse.json(
      { error: "Preview failed" },
      { status: 500 }
    );
  }
}
