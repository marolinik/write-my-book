/**
 * How the document library is grouped and ordered.
 *
 * The order is not a matter of taste: the product already states the order of
 * the work twice, and the library has to agree with both.
 *
 *   development-stages.ts (greenfield)
 *     idea -> synopsis -> structure -> research -> plan -> draft
 *   manuscript-stages.ts (imported manuscript)
 *     read -> style -> bible -> architecture -> analyze -> restructure -> edit
 *
 * They fold into one spine. Note that both put ANALYSIS ahead of EDITORIAL —
 * `analyze` suggests `restructure`, which suggests `dev-edit`, and the Razvoj
 * board renders them in exactly that order. The library used to invert it.
 *
 * Every book-level document type is claimed by exactly one group, which is what
 * `tests/unit/library-groups.test.ts` enforces against the Prisma enum. A type
 * with no home used to fall through to a gear icon labelled "Other" — that is
 * where the writer found his own synopsis (S3-2).
 */

/** Document types that belong to a series, never to a single book. */
export const SERIES_LEVEL_TYPES = [
  "SERIES_BIBLE",
  "SERIES_ARCHITECTURE",
  "SERIES_CONTINUITY",
  "SERIES_FINGERPRINT",
  "KNOWLEDGE_LEDGER",
];

/** The group keys, which double as the i18n keys for their labels. */
export type DocumentGroupKey =
  | "foundation"
  | "structure"
  | "research"
  | "chapters"
  | "analysis"
  | "editorial"
  | "publishing"
  | "notes";

export interface DocumentGroup {
  key: DocumentGroupKey;
  types: string[];
  /** Entries carry a chapter number and are listed by chapter. */
  perChapter?: boolean;
  /** Workflow offered when the group is empty. */
  emptyWorkflow?: string;
}

export const DOCUMENT_GROUPS: DocumentGroup[] = [
  {
    // What the book is and how it sounds, before anything is planned.
    key: "foundation",
    types: ["CONCEPT", "FINGERPRINT", "STORY_BIBLE"],
    emptyWorkflow: "capture-style",
  },
  {
    // The shape: the synopsis, the act/chapter architecture, the whole-book plan.
    key: "structure",
    types: ["SYNOPSIS", "ARCHITECTURE", "BOOK_PLAN"],
    emptyWorkflow: "build-architecture",
  },
  {
    key: "research",
    types: ["WORLD_RESEARCH", "TOPIC_RESEARCH"],
  },
  {
    key: "chapters",
    types: ["CHAPTER_BRIEF", "CHAPTER_PLAN", "CHAPTER_CONTENT"],
    perChapter: true,
    emptyWorkflow: "discuss-chapter",
  },
  {
    // Measuring the draft, and the structural moves that measurement argues for.
    key: "analysis",
    types: ["ANALYSIS_REPORT", "CONTINUITY_REPORT", "STRUCTURE_PROPOSAL"],
    emptyWorkflow: "analyze",
  },
  {
    key: "editorial",
    types: ["DEV_EDIT_REPORT", "LINE_EDIT_REPORT", "BETA_READ_REPORT"],
    perChapter: true,
    emptyWorkflow: "dev-edit",
  },
  {
    key: "publishing",
    types: ["MARKET_REPORT", "EXPORT_CONFIG"],
  },
  {
    // Freewriting, and the home for a type this build does not recognise —
    // a document the writer can still see beats one that vanishes.
    key: "notes",
    types: ["FREEWRITE"],
  },
];

/** Where an unrecognised type goes, so nothing is ever dropped. */
const FALLBACK_GROUP = "notes";

/**
 * Splits documents into the groups above, in flow order. Every group is
 * returned even when empty, so the caller can still offer its empty-state
 * workflow.
 */
export function groupDocuments<T extends { type: string }>(
  docs: readonly T[]
): Array<DocumentGroup & { docs: T[] }> {
  const claimed = new Set(DOCUMENT_GROUPS.flatMap((group) => group.types));

  return DOCUMENT_GROUPS.map((group) => ({
    ...group,
    docs: docs.filter(
      (doc) =>
        group.types.includes(doc.type) ||
        (group.key === FALLBACK_GROUP && !claimed.has(doc.type))
    ),
  }));
}
