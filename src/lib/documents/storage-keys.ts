import { DocumentType } from "@/generated/prisma/enums";

/**
 * Map a DocumentType to its canonical S3 storage path relative to the book/series prefix.
 */
export function getStoragePath(
  type: DocumentType,
  chapterNumber?: number,
  actNumber?: number
): string {
  const chPad = chapterNumber
    ? String(chapterNumber).padStart(2, "0")
    : "00";
  const actPad = actNumber ? String(actNumber) : "1";

  switch (type) {
    // Book-level singleton docs
    case DocumentType.CONCEPT:
      return ".planning/CONCEPT.md";
    case DocumentType.STORY_BIBLE:
      return ".planning/STORY-BIBLE.md";
    case DocumentType.ARCHITECTURE:
      return ".planning/ARCHITECTURE.md";
    case DocumentType.FINGERPRINT:
      return ".planning/FINGERPRINT.md";
    case DocumentType.EXPORT_CONFIG:
      return ".planning/EXPORT-CONFIG.json";
    case DocumentType.FREEWRITE:
      return `.planning/freewrite/freewrite-${Date.now()}.md`;

    // Chapter-scoped docs
    case DocumentType.CHAPTER_CONTENT:
      return `manuscript/act-${actPad}/chapter-${chPad}.md`;
    case DocumentType.CHAPTER_BRIEF:
      return `.planning/chapters/chapter-${chPad}-BRIEF.md`;
    case DocumentType.CHAPTER_PLAN:
      return `.planning/chapters/chapter-${chPad}-PLAN.md`;

    // Edit/analysis reports (chapter-scoped)
    case DocumentType.DEV_EDIT_REPORT:
      return `.planning/chapters/chapter-${chPad}-DEV-EDIT.md`;
    case DocumentType.LINE_EDIT_REPORT:
      return `.planning/chapters/chapter-${chPad}-LINE-EDIT.md`;
    case DocumentType.BETA_READ_REPORT:
      return `.planning/chapters/chapter-${chPad}-BETA-READ.md`;

    // Book-level reports
    case DocumentType.CONTINUITY_REPORT:
      return ".planning/CONTINUITY-REPORT.md";
    case DocumentType.ANALYSIS_REPORT:
      return ".planning/ANALYSIS-REPORT.md";
    case DocumentType.MARKET_REPORT:
      return ".planning/MARKET-REPORT.md";

    // Series-level docs
    case DocumentType.SERIES_BIBLE:
      return "SERIES-BIBLE.md";
    case DocumentType.SERIES_ARCHITECTURE:
      return "SERIES-ARCHITECTURE.md";
    case DocumentType.SERIES_CONTINUITY:
      return "SERIES-CONTINUITY.md";
    case DocumentType.SERIES_FINGERPRINT:
      return "SERIES-FINGERPRINT.md";
    case DocumentType.KNOWLEDGE_LEDGER:
      return "KNOWLEDGE-LEDGER.md";
  }
}

/**
 * Get the versioned storage path for a specific document version.
 */
export function getVersionStoragePath(
  documentId: string,
  version: number
): string {
  return `.versions/${documentId}/v${version}.md`;
}
