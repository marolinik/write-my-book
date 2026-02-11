import { z } from "zod";

export const createBookSchema = z.object({
  name: z.string().min(1).max(200),
  genre: z.string().max(50).nullable().optional(),
  language: z.string().min(2).max(10).optional().default("en"),
  seriesId: z.string().uuid().optional(),
  bookNumber: z.number().int().min(1).max(99).optional(),
});

export const updateBookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  genre: z.string().max(50).nullable().optional(),
  language: z.string().min(2).max(10).optional(),
  status: z
    .enum([
      "concept",
      "planning",
      "writing",
      "editing",
      "beta",
      "export",
      "complete",
    ])
    .optional(),
});

export const createSeriesSchema = z.object({
  title: z.string().min(1).max(200),
  genre: z.string().max(50).optional(),
  language: z.string().min(2).max(10).optional().default("en"),
  seriesType: z
    .enum(["DUOLOGY", "TRILOGY", "TETRALOGY", "PENTALOGY", "SAGA", "OPEN"])
    .optional()
    .default("TRILOGY"),
  plannedBooks: z.number().int().min(1).max(99).optional().default(3),
  description: z.string().max(2000).optional(),
});

export const updateSeriesSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  genre: z.string().max(50).nullable().optional(),
  seriesType: z
    .enum(["DUOLOGY", "TRILOGY", "TETRALOGY", "PENTALOGY", "SAGA", "OPEN"])
    .optional(),
  plannedBooks: z.number().int().min(1).max(99).optional(),
  description: z.string().max(2000).optional(),
});

export const createChapterSchema = z.object({
  actNumber: z.number().int().min(1).max(10),
  chapterNumber: z.number().int().min(1).max(999),
  title: z.string().max(200).optional(),
});

export const updateChapterSchema = z.object({
  title: z.string().max(200).optional(),
  status: z
    .enum([
      "undiscussed",
      "discussed",
      "planned",
      "drafted",
      "dev_edited",
      "line_edited",
      "beta_read",
      "beta_passed",
    ])
    .optional(),
  actNumber: z.number().int().min(1).max(10).optional(),
});

export const startActionSchema = z.object({
  action: z.string().min(1).max(100),
  chapterNumber: z.number().int().min(1).max(999).optional(),
  message: z.string().max(10000).optional(),
  followUpMessage: z.string().max(10000).optional(),
});

export const addApiKeySchema = z.object({
  provider: z.enum(["anthropic", "bedrock", "vertex", "azure"]),
  key: z.string().min(1).max(5000),
  label: z.string().max(100).optional(),
});

export const updateFindingSchema = z.object({
  action: z.enum(["apply", "dismiss"]),
  reason: z.string().max(1000).optional(),
});

export const updateSettingsSchema = z.object({
  modelGhostwriter: z.enum(["opus", "sonnet"]).optional(),
  modelEditor: z.enum(["opus", "sonnet", "haiku"]).optional(),
  modelBetaReader: z.enum(["opus", "sonnet", "haiku"]).optional(),
  modelAnalyst: z.enum(["sonnet", "haiku"]).optional(),
  autoCommit: z.boolean().optional(),
  styleStrictness: z.enum(["strict", "balanced", "relaxed"]).optional(),
  betaPanelSize: z.number().int().min(3).max(10).optional(),
  betaConsensus: z.number().int().min(50).max(100).optional(),
  betaConvergence: z.number().int().min(50).max(100).optional(),
  language: z.string().min(2).max(10).optional(),
});

export const sendMessageSchema = z.object({
  message: z.string().min(1).max(10000),
});

export const fileWriteSchema = z.object({
  content: z.string().max(1_000_000),
});

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
});

export const batchActionSchema = z.object({
  action: z.enum(["dev-edit", "line-edit"]),
  chapterRange: z.tuple([
    z.number().int().min(1).max(999),
    z.number().int().min(1).max(999),
  ]),
});

export const createStyleProfileSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  fingerprint: z.string().min(1).max(500_000).optional(),
  bookId: z.string().uuid().optional(),
  bookNumber: z.number().int().min(1).max(99).optional(),
});

// ─── Document Schemas ───────────────────────────────────────────

export const createDocumentSchema = z.object({
  type: z.enum([
    "CONCEPT", "STORY_BIBLE", "ARCHITECTURE", "FINGERPRINT",
    "CHAPTER_BRIEF", "CHAPTER_PLAN", "CHAPTER_CONTENT",
    "DEV_EDIT_REPORT", "LINE_EDIT_REPORT", "BETA_READ_REPORT",
    "CONTINUITY_REPORT", "ANALYSIS_REPORT", "MARKET_REPORT",
    "EXPORT_CONFIG", "FREEWRITE",
    "SERIES_BIBLE", "SERIES_ARCHITECTURE", "SERIES_CONTINUITY",
    "SERIES_FINGERPRINT", "KNOWLEDGE_LEDGER",
  ] as const),
  title: z.string().max(500).optional(),
  content: z.string().max(2_000_000),
  chapterNumber: z.number().int().min(1).max(999).optional(),
  actNumber: z.number().int().min(1).max(10).optional(),
  changeSource: z.string().max(200).optional(),
});

export const updateDocumentSchema = z.object({
  content: z.string().max(2_000_000),
  title: z.string().max(500).optional(),
  changeType: z.enum(["agent_write", "manual_edit", "revision"]).optional(),
  changeSource: z.string().max(200).optional(),
});

export const restoreVersionSchema = z.object({
  version: z.number().int().min(1),
});

export const updateChapterContentSchema = z.object({
  markdown: z.string().max(2_000_000),
  changeSource: z.string().max(200).optional(),
});

export const exportConfigSchema = z.object({
  metadata: z.object({
    title: z.string().max(500),
    subtitle: z.string().max(500),
    author: z.string().max(200),
    seriesName: z.string().max(200),
    seriesNumber: z.string().max(20),
    isbn: z.string().max(50),
    publisher: z.string().max(200),
    copyrightYear: z.string().max(10),
  }),
  format: z.object({
    defaultFormats: z.object({
      docx: z.boolean(),
      pdf: z.boolean(),
      epub: z.boolean(),
    }),
    trimSize: z.string().max(20),
    customWidth: z.string().max(20),
    customHeight: z.string().max(20),
    genreTemplate: z.string().max(100),
  }),
  sceneBreakGlyph: z.string().max(50),
  frontMatter: z.object({
    coverPage: z.boolean(),
    halfTitle: z.boolean(),
    titlePage: z.boolean(),
    copyrightPage: z.boolean(),
    dedication: z.boolean(),
    tableOfContents: z.boolean(),
    coverImagePath: z.string().max(500),
    dedicationPath: z.string().max(500),
  }),
  backMatter: z.object({
    aboutAuthor: z.boolean(),
    alsoBy: z.boolean(),
    acknowledgments: z.boolean(),
    aboutAuthorPath: z.string().max(500),
    alsoByPath: z.string().max(500),
    acknowledgmentsPath: z.string().max(500),
  }),
  styleGuide: z.object({
    oxfordComma: z.boolean(),
    spellOutNumbers: z.boolean(),
    closedEmDashes: z.boolean(),
    thinSpaceEllipsis: z.boolean(),
    sentenceCaseHeadings: z.boolean(),
  }),
  customTemplates: z.object({
    docxReference: z.string().max(500),
    epubCss: z.string().max(500),
    typstTemplate: z.string().max(500),
  }),
  typography: z.object({
    autoHyphenation: z.boolean(),
    widowOrphanControl: z.enum(["strict", "relaxed", "off"]),
    justifiedText: z.boolean(),
  }),
});

// ─── Editorial Schemas ──────────────────────────────────────────

export const findingsQuerySchema = z.object({
  chapterNumber: z.coerce.number().int().min(1).max(999).optional(),
  severity: z.enum(["critical", "major", "moderate", "minor"]).optional(),
  category: z.string().max(100).optional(),
  status: z.enum(["pending", "applied", "dismissed"]).optional(),
  agentType: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const batchCreateFindingsSchema = z.object({
  findings: z.array(
    z.object({
      chapterNumber: z.number().int().min(1).max(999),
      severity: z.enum(["critical", "major", "moderate", "minor"]),
      category: z.string().min(1).max(100),
      description: z.string().min(1).max(5000),
      suggestion: z.string().max(5000).optional(),
      locationStart: z.string().max(500).optional(),
      locationEnd: z.string().max(500).optional(),
      agentType: z.string().max(50).optional().default("agent"),
      sessionId: z.string().uuid().optional(),
    })
  ).min(1).max(500),
});

export const createDismissedPatternSchema = z.object({
  chapterNumber: z.number().int().min(1).max(999),
  agentType: z.string().min(1).max(50),
  patternHash: z.string().min(1).max(200),
  reason: z.string().max(1000).optional(),
});

export const dismissedPatternQuerySchema = z.object({
  chapterNumber: z.coerce.number().int().min(1).max(999),
  agentType: z.string().max(50),
});

export const editHistoryQuerySchema = z.object({
  chapterNumber: z.coerce.number().int().min(1).max(999).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ─── Series Management Schemas ───────────────────────────────────

export const addBookToSeriesSchema = z.object({
  name: z.string().min(1).max(200),
  genre: z.string().max(50).optional(),
  language: z.string().min(2).max(10).optional(),
});

export const reorderBookSchema = z.object({
  newBookNumber: z.number().int().min(1).max(99),
});

export const applyInheritanceSchema = z.object({
  bookId: z.string().uuid(),
  documentTypes: z
    .array(
      z.enum([
        "SERIES_BIBLE",
        "SERIES_ARCHITECTURE",
        "SERIES_FINGERPRINT",
      ])
    )
    .optional(),
});

export const synthesizeSchema = z.object({
  bookId: z.string().uuid(),
  bookNumber: z.number().int().min(1).max(99),
  artifactType: z.enum(["STORY_BIBLE", "ARCHITECTURE", "FINGERPRINT"]),
});

export const startSeriesAgentSchema = z.object({
  workflowId: z.string().min(1),
  bookId: z.string().uuid(),
  chapterNumber: z.number().int().min(1).max(999).optional(),
  message: z.string().max(10000).optional(),
});

// ─── Import / Export Schemas ────────────────────────────────────

export const importUploadSchema = z.object({
  actNumber: z.coerce.number().int().min(1).max(10).optional().default(1),
});

export const exportRequestSchema = z.object({
  format: z.enum(["docx", "pdf", "epub"]),
  isDraft: z.boolean().optional().default(false),
  sceneBreakGlyph: z.string().max(50).optional(),
  template: z.string().max(100).optional(),
});

export const exportConfigUpdateSchema = exportConfigSchema.partial();

// ─── Settings Schemas ─────────────────────────────────────────

export const createApiKeySchema = z.object({
  provider: z.enum(["anthropic", "bedrock", "vertex", "azure"]),
  key: z.string().min(1).max(5000),
  label: z.string().max(100).optional(),
});

export const updateUserSettingsSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
});

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

// ─── Style Profile Schemas ────────────────────────────────────

export const updateStyleProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  fingerprint: z.string().max(500_000).optional(),
});

export const createCharacterLensSchema = z.object({
  characterName: z.string().min(1).max(200),
  sensoryPriority: z.string().min(1).max(500),
  metaphorDomain: z.string().min(1).max(500),
  interiorStyle: z.string().min(1).max(500),
  vocabularyRegister: z.string().min(1).max(500),
  blindSpots: z.string().max(1000).optional(),
});

export const updateCharacterLensSchema = z.object({
  characterName: z.string().min(1).max(200).optional(),
  sensoryPriority: z.string().min(1).max(500).optional(),
  metaphorDomain: z.string().min(1).max(500).optional(),
  interiorStyle: z.string().min(1).max(500).optional(),
  vocabularyRegister: z.string().min(1).max(500).optional(),
  blindSpots: z.string().max(1000).optional(),
});
