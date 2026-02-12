import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

export const APPROVAL_SENTINEL = "__APPROVAL_GATE__";

// ─── In-memory document locks for parallel agent safety ────────

const documentLocks = new Map<string, Map<string, string>>(); // bookId -> lockKey -> sessionId

function acquireDocLock(
  bookId: string,
  lockKey: string,
  sessionId: string
): boolean {
  const bookLocks = documentLocks.get(bookId) ?? new Map();
  if (bookLocks.has(lockKey) && bookLocks.get(lockKey) !== sessionId) {
    return false;
  }
  bookLocks.set(lockKey, sessionId);
  documentLocks.set(bookId, bookLocks);
  return true;
}

function releaseDocLock(
  bookId: string,
  lockKey: string,
  sessionId: string
): void {
  const bookLocks = documentLocks.get(bookId);
  if (bookLocks?.get(lockKey) === sessionId) {
    bookLocks.delete(lockKey);
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolContext {
  bookId: string;
  userId: string;
  sessionId: string;
  agentType: string;
  documentService: DocumentService;
  seriesId?: string;
  seriesDocumentService?: DocumentService;
}

// ─── Tool Definitions ──────────────────────────────────────────

const readDocumentDef: ToolDefinition = {
  name: "ReadDocument",
  description:
    "Read a document's content by type. Returns the full text of the document.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The document type to read",
        enum: Object.values(DocumentType),
      },
      chapterNumber: {
        type: "number",
        description: "Chapter number (required for chapter-scoped documents)",
      },
    },
    required: ["documentType"],
  },
};

const writeDocumentDef: ToolDefinition = {
  name: "WriteDocument",
  description:
    "Create or update a document. If a document of this type already exists, it will be updated with a new version.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The document type to write",
        enum: Object.values(DocumentType),
      },
      content: {
        type: "string",
        description: "The full content to write",
      },
      title: {
        type: "string",
        description: "Optional title for the document",
      },
      chapterNumber: {
        type: "number",
        description: "Chapter number (required for chapter-scoped documents)",
      },
    },
    required: ["documentType", "content"],
  },
};

const readChapterDef: ToolDefinition = {
  name: "ReadChapter",
  description: "Read the markdown content of a chapter by chapter number.",
  input_schema: {
    type: "object",
    properties: {
      chapterNumber: {
        type: "number",
        description: "The chapter number to read",
      },
    },
    required: ["chapterNumber"],
  },
};

const writeChapterDef: ToolDefinition = {
  name: "WriteChapter",
  description: "Write or update a chapter's markdown content.",
  input_schema: {
    type: "object",
    properties: {
      chapterNumber: {
        type: "number",
        description: "The chapter number to write",
      },
      markdown: {
        type: "string",
        description: "The full markdown content for the chapter",
      },
    },
    required: ["chapterNumber", "markdown"],
  },
};

const listDocumentsDef: ToolDefinition = {
  name: "ListDocuments",
  description:
    "List all documents for the current book, optionally filtered by type.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "Optional: filter by document type",
        enum: Object.values(DocumentType),
      },
    },
  },
};

const createFindingDef: ToolDefinition = {
  name: "CreateFinding",
  description:
    "Create an edit finding (issue found during editing). Used by dev-editor, line-editor, and continuity-checker.",
  input_schema: {
    type: "object",
    properties: {
      chapterNumber: {
        type: "number",
        description: "Chapter number where the finding was identified",
      },
      severity: {
        type: "string",
        description: "Severity level",
        enum: ["critical", "major", "moderate", "minor"],
      },
      category: {
        type: "string",
        description:
          "Category of the finding (e.g. pacing, dialogue, anti-ai, continuity)",
      },
      description: {
        type: "string",
        description: "Detailed description of the issue",
      },
      suggestion: {
        type: "string",
        description: "Suggested fix or improvement",
      },
      locationStart: {
        type: "string",
        description: "Start location reference in the text",
      },
      locationEnd: {
        type: "string",
        description: "End location reference in the text",
      },
    },
    required: ["chapterNumber", "severity", "category", "description"],
  },
};

const requestApprovalDef: ToolDefinition = {
  name: "RequestApproval",
  description:
    "Pause execution and ask the writer for approval before proceeding with a significant action.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the approval request",
      },
      description: {
        type: "string",
        description: "Detailed description of what you want to do and why",
      },
    },
    required: ["title", "description"],
  },
};

const SERIES_DOC_TYPES = [
  "SERIES_BIBLE",
  "SERIES_ARCHITECTURE",
  "SERIES_CONTINUITY",
  "SERIES_FINGERPRINT",
  "KNOWLEDGE_LEDGER",
];

const readSeriesDocumentDef: ToolDefinition = {
  name: "ReadSeriesDocument",
  description:
    "Read a series-level document's content by type. Returns the full text of the series document.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The series document type to read",
        enum: SERIES_DOC_TYPES,
      },
    },
    required: ["documentType"],
  },
};

const writeSeriesDocumentDef: ToolDefinition = {
  name: "WriteSeriesDocument",
  description:
    "Create or update a series-level document. If a document of this type already exists, it will be updated with a new version.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The series document type to write",
        enum: SERIES_DOC_TYPES,
      },
      content: {
        type: "string",
        description: "The full content to write",
      },
      title: {
        type: "string",
        description: "Optional title for the document",
      },
    },
    required: ["documentType", "content"],
  },
};

const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  readDocumentDef,
  writeDocumentDef,
  readChapterDef,
  writeChapterDef,
  listDocumentsDef,
  createFindingDef,
  requestApprovalDef,
  readSeriesDocumentDef,
  writeSeriesDocumentDef,
];

/** Get tool definitions filtered by allowed tool names. */
export function getToolDefinitions(
  allowedTools: string[]
): ToolDefinition[] {
  return ALL_TOOL_DEFINITIONS.filter((t) => allowedTools.includes(t.name));
}

// ─── Tool Executors ────────────────────────────────────────────

async function executeReadDocument(
  ctx: ToolContext,
  input: { documentType: string; chapterNumber?: number }
): Promise<string> {
  const type = input.documentType as DocumentType;
  const doc = await ctx.documentService.findByType(type, input.chapterNumber);
  if (!doc) {
    return `No ${input.documentType} document found${input.chapterNumber ? ` for chapter ${input.chapterNumber}` : ""}.`;
  }
  const result = await ctx.documentService.read(doc.id);
  if (!result) return "Document not found.";
  return result.content;
}

async function executeWriteDocument(
  ctx: ToolContext,
  input: {
    documentType: string;
    content: string;
    title?: string;
    chapterNumber?: number;
  }
): Promise<string> {
  const type = input.documentType as DocumentType;

  // Acquire document lock to prevent parallel agents writing the same type
  const lockKey = `${type}:${input.chapterNumber ?? "null"}`;
  if (!acquireDocLock(ctx.bookId, lockKey, ctx.sessionId)) {
    return `Another agent is currently writing ${input.documentType}. Please wait and retry.`;
  }

  try {
    // Use transaction to prevent duplicate creation by parallel agents
    const result = await db.$transaction(async (tx) => {
      const where: Record<string, unknown> = { type };
      if (ctx.bookId) where.bookId = ctx.bookId;
      if (input.chapterNumber !== undefined)
        where.chapterNumber = input.chapterNumber;

      const existing = await tx.document.findFirst({ where });

      if (existing) {
        const updated = await ctx.documentService.update(
          existing.id,
          input.content,
          input.title,
          "agent_write",
          "agent"
        );
        return `Updated ${input.documentType} (version ${updated.version.version}).`;
      }

      const doc = await ctx.documentService.create(
        type,
        input.content,
        input.title,
        input.chapterNumber,
        undefined,
        "agent"
      );
      return `Created ${input.documentType} (id: ${doc.id}).`;
    });

    return result;
  } finally {
    releaseDocLock(ctx.bookId, lockKey, ctx.sessionId);
  }
}

async function executeReadChapter(
  ctx: ToolContext,
  input: { chapterNumber: number }
): Promise<string> {
  const doc = await ctx.documentService.findByType(
    DocumentType.CHAPTER_CONTENT,
    input.chapterNumber
  );
  if (!doc) {
    return `No content found for chapter ${input.chapterNumber}.`;
  }
  const result = await ctx.documentService.read(doc.id);
  if (!result) return "Chapter content not found.";
  return result.content;
}

async function executeWriteChapter(
  ctx: ToolContext,
  input: { chapterNumber: number; markdown: string }
): Promise<string> {
  // Find the chapter record
  const chapter = await db.chapter.findFirst({
    where: { bookId: ctx.bookId, chapterNumber: input.chapterNumber },
  });
  if (!chapter) {
    return `Chapter ${input.chapterNumber} not found in this book.`;
  }

  // Find or create the chapter content document
  const existing = await ctx.documentService.findByType(
    DocumentType.CHAPTER_CONTENT,
    input.chapterNumber
  );

  if (existing) {
    await ctx.documentService.update(
      existing.id,
      input.markdown,
      undefined,
      "agent_write",
      "agent"
    );
  } else {
    await ctx.documentService.create(
      DocumentType.CHAPTER_CONTENT,
      input.markdown,
      `Chapter ${input.chapterNumber}`,
      input.chapterNumber,
      chapter.actNumber,
      "agent"
    );
  }

  // Update word count on the chapter record
  const wordCount = input.markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_~`>|-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  await db.chapter.update({
    where: { id: chapter.id },
    data: { wordCount },
  });

  return `Wrote chapter ${input.chapterNumber} (${wordCount} words).`;
}

async function executeListDocuments(
  ctx: ToolContext,
  input: { documentType?: string }
): Promise<string> {
  const filter = input.documentType
    ? { type: input.documentType as DocumentType }
    : undefined;

  const docs = await ctx.documentService.list(filter);
  if (docs.length === 0) {
    return "No documents found.";
  }

  return docs
    .map(
      (d) =>
        `- ${d.type}${d.chapterNumber ? ` (ch ${d.chapterNumber})` : ""}: ${d.title ?? "(untitled)"} [v${d.currentVersion}]`
    )
    .join("\n");
}

async function executeCreateFinding(
  ctx: ToolContext,
  input: {
    chapterNumber: number;
    severity: string;
    category: string;
    description: string;
    suggestion?: string;
    locationStart?: string;
    locationEnd?: string;
  }
): Promise<string> {
  // Cross-session dedup: check for existing non-dismissed finding with same signature
  const existing = await db.editFinding.findFirst({
    where: {
      bookId: ctx.bookId,
      chapterNumber: input.chapterNumber,
      category: input.category,
      description: input.description,
      status: { not: "dismissed" },
    },
  });

  if (existing) {
    return `Finding already exists (id: ${existing.id}). Skipped duplicate.`;
  }

  const finding = await db.editFinding.create({
    data: {
      bookId: ctx.bookId,
      chapterNumber: input.chapterNumber,
      agentType: ctx.agentType,
      sessionId: ctx.sessionId,
      severity: input.severity,
      category: input.category,
      description: input.description,
      suggestion: input.suggestion ?? null,
      locationStart: input.locationStart ?? null,
      locationEnd: input.locationEnd ?? null,
    },
  });

  return `Finding created (id: ${finding.id}, severity: ${input.severity}, category: ${input.category}).`;
}

async function executeReadSeriesDocument(
  ctx: ToolContext,
  input: { documentType: string }
): Promise<string> {
  if (!ctx.seriesDocumentService) {
    return "Error: No series context available. This tool requires a series workflow.";
  }
  const type = input.documentType as DocumentType;
  const doc = await ctx.seriesDocumentService.findByType(type);
  if (!doc) {
    return `No ${input.documentType} document found for this series.`;
  }
  const result = await ctx.seriesDocumentService.read(doc.id);
  if (!result) return "Document not found.";
  return result.content;
}

async function executeWriteSeriesDocument(
  ctx: ToolContext,
  input: { documentType: string; content: string; title?: string }
): Promise<string> {
  if (!ctx.seriesDocumentService) {
    return "Error: No series context available. This tool requires a series workflow.";
  }
  const type = input.documentType as DocumentType;
  const existing = await ctx.seriesDocumentService.findByType(type);

  if (existing) {
    const result = await ctx.seriesDocumentService.update(
      existing.id,
      input.content,
      input.title,
      "agent_write",
      "agent"
    );
    return `Updated ${input.documentType} (version ${result.version.version}).`;
  }

  const doc = await ctx.seriesDocumentService.create(
    type,
    input.content,
    input.title,
    undefined,
    undefined,
    "agent"
  );
  return `Created ${input.documentType} (id: ${doc.id}).`;
}

/** Execute a tool by name. Returns APPROVAL_SENTINEL for approval gates. */
export async function executeTool(
  toolName: string,
  ctx: ToolContext,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "ReadDocument":
        return executeReadDocument(
          ctx,
          input as { documentType: string; chapterNumber?: number }
        );
      case "WriteDocument":
        return executeWriteDocument(
          ctx,
          input as {
            documentType: string;
            content: string;
            title?: string;
            chapterNumber?: number;
          }
        );
      case "ReadChapter":
        return executeReadChapter(
          ctx,
          input as { chapterNumber: number }
        );
      case "WriteChapter":
        return executeWriteChapter(
          ctx,
          input as { chapterNumber: number; markdown: string }
        );
      case "ListDocuments":
        return executeListDocuments(
          ctx,
          input as { documentType?: string }
        );
      case "CreateFinding":
        return executeCreateFinding(
          ctx,
          input as {
            chapterNumber: number;
            severity: string;
            category: string;
            description: string;
            suggestion?: string;
            locationStart?: string;
            locationEnd?: string;
          }
        );
      case "RequestApproval":
        return APPROVAL_SENTINEL;
      case "ReadSeriesDocument":
        return executeReadSeriesDocument(
          ctx,
          input as { documentType: string }
        );
      case "WriteSeriesDocument":
        return executeWriteSeriesDocument(
          ctx,
          input as { documentType: string; content: string; title?: string }
        );
      default:
        return `Error: Unknown tool: ${toolName}`;
    }
  } catch (error) {
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
