import { z } from "zod";
import { exportConfigSchema } from "@/lib/validation";

/** A single parsed chapter from an imported manuscript. */
export interface ParsedChapter {
  number: number;
  title: string;
  content: string;
  wordCount: number;
}

/** Result of importing one or more manuscript files. */
export interface ImportResult {
  chapters: ParsedChapter[];
  totalWordCount: number;
  warnings: string[];
  filename: string;
}

/** Options passed to the export pipeline. */
export interface ExportOptions {
  bookId: string;
  /** Owning user — chapter content is resolved via DocumentService in DB
   *  chapterNumber order, exactly like live chapter reads (D-03). */
  userId: string;
  format: "docx" | "pdf" | "epub";
  isDraft?: boolean;
  sceneBreakGlyph?: string;
  template?: string;
  /** Export all books in a series as a single omnibus volume. */
  omnibus?: boolean;
  /** Series title (used for omnibus front matter). */
  seriesTitle?: string;
  /** Ordered list of books with numbers and titles for omnibus. */
  bookList?: { bookNumber: number; title: string }[];
  /** Real chapter titles from the DB, keyed by chapter number (F9/F10). */
  chapterTitles?: Map<number, string>;
  /** UDG round-5 (Igor): uploaded book-cover object key (Book.coverUrl), relative
   *  to this book's storage scope. When set and no configured coverImagePath, read
   *  the bytes from S3 and bind them into PDF/EPUB front matter + EPUB metadata. */
  coverUrl?: string | null;
  /** UDG round-8 (Igor/Olivera): uploaded BACK-cover object key (Book.backCoverUrl),
   *  bound into PDF/EPUB as a trailing back-cover page (same S3 + tempdir rewrite). */
  backCoverUrl?: string | null;
}

/** Result returned by the export pipeline. */
export interface ExportResult {
  filename: string;
  storageKey: string;
  wordCount: number;
  chapterCount: number;
  estimatedPages: number;
  warnings: string[];
  format: string;
}

/** Per-language formatting for PDF/DOCX/EPUB generation. */
export interface ExportFormatConfig {
  pageSize: "letter" | "a4";
  bodyFont: string;
  hyphenationLang: string;
  lineSpacing: number;
  paragraphIndent: number;
  openQuote: string;
  closeQuote: string;
}

/** Full export configuration — inferred from Zod schema. */
export type ExportConfig = z.infer<typeof exportConfigSchema>;
