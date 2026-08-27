import { exec, execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { DocumentType } from "@/generated/prisma/enums";
// Pure, db-free helper — safe for this module's static import graph.
import { isOrphanedChapterContent } from "@/lib/documents/orphan-chapter-content";
import type { StorageAdapter } from "@/lib/storage/types";
import type { ExportConfig, ExportOptions, ExportResult } from "./types";
import { getDefaultExportConfig, parseExportConfigJson } from "./export-config";
import { resolveSafeTemplatePath } from "./safe-path";
import { getExportFormatConfig } from "./language-config";
import { assembleFrontMatter, assembleSeriesFrontMatter } from "./front-matter";
import { assembleBackMatter } from "./back-matter";

const execAsync = promisify(exec);
// D-18: pandoc/typst are invoked via execFile (argv array, NO shell) so that
// writer-controlled fields can never be parsed as shell syntax. execAsync
// (shell) survives ONLY for tool DETECTION below, which interpolates a
// hardcoded tool name and never any user data — see checkToolAvailable's guard.
const execFileAsync = promisify(execFile);

/**
 * Ensure a chapter's markdown leads with a canonical level-1 heading taken from
 * the DB chapter title (F9/F10). Without this, chapters whose markdown lacks a
 * heading export untitled or inherit the book title in the TOC/headings, and
 * pandoc derives each EPUB file's `<title>` from the wrong text.
 *
 * - If `content` already opens with a heading line, that line is REPLACED with
 *   `# <title>` so the DB title wins over an inconsistent in-content heading.
 * - Otherwise `# <title>` is PREPENDED.
 * - Falls back to `Chapter <n>` when no DB title is available.
 */
export function applyChapterHeading(
  content: string,
  chapterNumber: number,
  title?: string
): string {
  const headingText =
    title && title.trim() ? title.trim() : `Chapter ${chapterNumber}`;
  const heading = `# ${headingText}`;

  const trimmed = content.replace(/^\s+/, "");
  const firstHeading = trimmed.match(/^#{1,6}[ \t]+[^\n]*(?:\n|$)/);
  if (firstHeading) {
    const rest = trimmed.slice(firstHeading[0].length).replace(/^\s+/, "");
    return rest ? `${heading}\n\n${rest}` : `${heading}\n`;
  }
  return trimmed ? `${heading}\n\n${trimmed}` : `${heading}\n`;
}

/**
 * Build a filesystem/URL/Content-Disposition-safe export filename stem from a
 * book title. D-46: the previous `replace(/[^a-zA-Z0-9-_ ]/g, "")` DROPPED every
 * diacritic ("Kőszeg" → "Kszeg", ≥8 occurrences P7-func J-1). We first fold
 * accented Latin letters to their base (NFD + strip combining marks: ő → o),
 * THEN drop anything still outside the ASCII-safe set, so the download route's
 * `/[/\\]/` + `..` rejections and the Content-Disposition header stay ASCII
 * clean end-to-end. A title that leaves nothing behind (a non-Latin script, or
 * pure punctuation) falls back to a stable stem instead of an empty one, so the
 * final `<stem>-<timestamp>.<fmt>` never degrades to `-2026-…`.
 */
export function sanitizeExportFilename(bookName: string): string {
  const stem = bookName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks (é → e, ő → o)
    .replace(/[^a-zA-Z0-9-_ ]/g, "") // drop any remaining non-ASCII / unsafe chars
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, ""); // trim stray edge hyphens left by removals
  return stem.length > 0 ? stem : "book";
}

/**
 * Estimate the rendered PDF page count for a manuscript of `wordCount` words.
 * D-61 / Z15-B3: a single `ceil(words / 350)` divisor overshot badly at book
 * scale ("The Kőszeg Manuscript P7": 81,095 words estimated 232 vs 165 actual,
 * +40.6%) because the error SCALES with length — there is a fixed front-matter
 * block (half-title / title / copyright / etc.: a handful of near-empty pages)
 * PLUS body text at a higher observed density than 350 w/pg, and one divisor
 * cannot represent both. A two-parameter model (fixed offset + body density)
 * fits both measured anchors within ~6%: (6,187 w → 17 pp) and (81,095 w → 165 pp).
 */
export function estimateRenderedPages(wordCount: number): number {
  const FRONT_MATTER_PAGES = 5; // fixed near-empty front matter (title/copyright/…)
  const BODY_WORDS_PER_PAGE = 500; // observed rendered body density
  const words = Number.isFinite(wordCount) && wordCount > 0 ? wordCount : 0;
  return FRONT_MATTER_PAGES + Math.ceil(words / BODY_WORDS_PER_PAGE);
}

/** Decode the small set of HTML entities pandoc emits in heading text. */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // `&amp;` last so an already-escaped `&amp;amp;` does not double-decode.
    .replace(/&amp;/g, "&");
}

/** Escape plain text for insertion as XML character data. */
function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Rewrite a single EPUB content file's `<head><title>` to match its first
 * `<h1>` heading (F10). Pandoc's `--split-level=1` names each split file
 * `chNNN.xhtml` and copies that filename into `<title>`, so e-readers list the
 * filename instead of the chapter title. This restores the heading text.
 *
 * Pure and side-effect free so it is unit-testable. Files with no `<h1>`
 * (e.g. the nav/TOC document) are returned unchanged; nested inline markup in
 * the heading is stripped and basic entities decoded, then XML-re-escaped.
 */
export function rewriteXhtmlTitleFromH1(xhtml: string): string {
  const h1Match = xhtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) return xhtml;

  const headingText = decodeBasicEntities(h1Match[1].replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  if (!headingText) return xhtml;

  const titleText = escapeXmlText(headingText);
  let replaced = false;
  const out = xhtml.replace(
    /(<title[^>]*>)([\s\S]*?)(<\/title>)/i,
    (_full, open: string, _inner: string, close: string) => {
      replaced = true;
      return `${open}${titleText}${close}`;
    }
  );
  return replaced ? out : xhtml;
}

/**
 * Post-process a pandoc-generated EPUB so every content file's `<title>`
 * carries its chapter heading rather than the `chNNN.xhtml` split filename
 * (F10). The OCF `mimetype` entry is re-asserted first and STORED
 * (uncompressed) so the archive remains a valid EPUB.
 */
export async function rewriteEpubChapterTitles(epub: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(epub);
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || !/\.x?html$/i.test(name)) continue;
    const original = await entry.async("string");
    const rewritten = rewriteXhtmlTitleFromH1(original);
    if (rewritten !== original) zip.file(name, rewritten);
  }
  // OCF requires `mimetype` to be the first entry and STORED. Re-asserting an
  // existing key keeps its position (pandoc writes it first), and the explicit
  // STORE compression guarantees it is never deflated on regeneration.
  if (zip.files["mimetype"]) {
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  }
  return zip.generateAsync({
    type: "nodebuffer",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

const LUA_FILTERS_DIR = join(process.cwd(), "export-templates");
const TEMPLATES_DIR = join(process.cwd(), "export-templates");

/** Resolved tool paths cache — avoids repeated lookups. */
const resolvedToolPaths: Record<string, string> = {};

async function checkToolAvailable(name: string): Promise<boolean> {
  // Tool DETECTION below runs `where`/`which`, an env-var `--version` probe, and
  // a WinGet `dir | findstr` PIPE through the shell (execAsync). `name` is
  // interpolated into those shell strings, so it MUST be a bare tool identifier
  // and never carry user data. Callers only ever pass the literals "pandoc" /
  // "typst"; this guard makes that structurally enforced rather than a
  // convention, so no future caller can turn detection into a shell-injection
  // sink (D-18). Note the actual document-generation invocation does NOT go
  // through a shell at all — it uses execFile with an argv array (buildPandocArgs).
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid tool name: ${name}`);
  }

  // Check cache first
  if (resolvedToolPaths[name]) return true;

  // Try PATH first
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    const { stdout } = await execAsync(cmd);
    const resolved = stdout.trim().split(/\r?\n/)[0];
    if (resolved) resolvedToolPaths[name] = resolved;
    return true;
  } catch {
    // Not on PATH — try env var and common locations on Windows
  }

  // Check TOOL_PATH env var (e.g. TYPST_PATH, PANDOC_PATH)
  const envPath = process.env[`${name.toUpperCase()}_PATH`];
  if (envPath) {
    try {
      await execAsync(`"${envPath}" --version`);
      resolvedToolPaths[name] = envPath;
      return true;
    } catch { /* not valid */ }
  }

  // Windows: check WinGet packages directory
  if (process.platform === "win32") {
    const homedir = process.env.USERPROFILE || process.env.HOME || "";
    const wingetBase = join(homedir, "AppData", "Local", "Microsoft", "WinGet", "Packages");
    try {
      const { stdout } = await execAsync(`dir "${wingetBase}\\*${name}*" /s /b 2>nul | findstr "${name}.exe"`);
      const resolved = stdout.trim().split(/\r?\n/)[0];
      if (resolved) {
        resolvedToolPaths[name] = resolved;
        return true;
      }
    } catch { /* not found */ }
  }

  return false;
}

/**
 * Fully-resolved inputs for one pandoc invocation. All filesystem/tool
 * resolution (which default reference-doc/template/css exist, the typst engine
 * path) is done by the caller and passed in as plain values, so buildPandocArgs
 * stays a pure, synchronous, unit-testable function.
 */
export interface PandocArgsInput {
  /** Resolved pandoc executable path (or bare "pandoc" if only on PATH). */
  pandocCmd: string;
  inputPath: string;
  outputPath: string;
  format: "docx" | "pdf" | "epub";
  /** Absolute paths of the Lua filters to apply, in order. */
  luaFilterPaths: string[];
  /** Document title (config.metadata.title || bookName) — writer-controlled. */
  title: string;
  /** Scene-break glyph — writer-controlled. */
  sceneBreakGlyph: string;
  /** docx: resolved reference-doc path, or null to let pandoc use its default. */
  referenceDoc?: string | null;
  /** pdf: resolved typst engine path. */
  typstEngine?: string | null;
  /** pdf: resolved typst template path, or null for pandoc's default. */
  typstTemplate?: string | null;
  /** epub: resolved CSS path, or null. */
  epubCss?: string | null;
  /** epub: resolved cover-image path, or null. */
  epubCoverImage?: string | null;
}

/**
 * Build the pandoc invocation as an ARGV ARRAY (element 0 is the executable).
 *
 * D-18 (OS command-injection fix): every value is a DISCRETE array element with
 * NO surrounding quotes and NO shell involvement. When this array is handed to
 * execFile, the OS passes each element to pandoc verbatim, so writer-controlled
 * fields (title, scene-break glyph, custom template/css/cover paths) cannot be
 * interpreted as shell metacharacters — injection is structurally impossible,
 * not merely escaped. Pandoc accepts `--metadata=title:VALUE`,
 * `--variable=k:VALUE`, `--lua-filter=PATH`, `--reference-doc=PATH`,
 * `--template=PATH`, `--css=PATH`, `--epub-cover-image=PATH`, `--pdf-engine=PATH`
 * each as a SINGLE argv token (verified against pandoc 3.9), so the `:`/spaces
 * inside a value never need a shell to be parsed.
 */
export function buildPandocArgs(input: PandocArgsInput): string[] {
  const args: string[] = [
    input.pandocCmd,
    input.inputPath,
    "-o",
    input.outputPath,
    "--from=markdown",
    ...input.luaFilterPaths.map((p) => `--lua-filter=${p}`),
    `--metadata=title:${input.title}`,
    `--variable=scene-break-glyph:${input.sceneBreakGlyph}`,
    "--standalone",
  ];

  if (input.format === "docx") {
    args.push("--to=docx");
    if (input.referenceDoc) {
      args.push(`--reference-doc=${input.referenceDoc}`);
    }
  } else if (input.format === "pdf") {
    if (input.typstEngine) {
      args.push(`--pdf-engine=${input.typstEngine}`);
    }
    if (input.typstTemplate) {
      args.push(`--template=${input.typstTemplate}`);
    }
    args.push("--to=pdf");
  } else if (input.format === "epub") {
    args.push("-t", "epub3");
    args.push("--split-level=1");
    if (input.epubCss) {
      args.push(`--css=${input.epubCss}`);
    }
    if (input.epubCoverImage) {
      args.push(`--epub-cover-image=${input.epubCoverImage}`);
    }
  }

  return args;
}

async function requireTool(name: string): Promise<void> {
  const available = await checkToolAvailable(name);
  if (!available) {
    throw new Error(
      `${name} is not installed or not on PATH. ` +
      `${name} is required for manuscript export. ` +
      `See the setup guide: https://github.com/writemybookok/write-my-book-ok#pandoc--typst-setup`
    );
  }
}

/** Chapter markdown assembled for the combined export document. */
interface AssembledChapters {
  chapterContent: string;
  chapterCount: number;
}

/**
 * Assemble chapter markdown in DB chapterNumber order (D-03).
 *
 * Storage paths embed the chapter number from CREATION time and are
 * deliberately never renamed on reorder (chapters/reorder/route.ts keeps
 * `storageKey` as the physical content pointer and moves only the DB
 * `chapter_number` lookup column). A path-sorted listing therefore pairs DB
 * titles with the WRONG bodies after any reorder — so chapter identity comes
 * from the DB, and each chapter's actual prose is resolved exactly like the
 * live chapter-content GET route: DocumentService.findByType(CHAPTER_CONTENT,
 * chapterNumber) + readPinned (mirrors the VM2 fix — read real content via the
 * service, never guess from paths). Act dividers likewise derive from the DB
 * `actNumber`, never the `act-N` path segment.
 *
 * `@/lib/db` and `@/lib/documents` are imported lazily so this module's static
 * import graph stays db-free for the pure-function consumers
 * (applyChapterHeading / rewriteXhtmlTitleFromH1 unit tests).
 */
export async function assembleChapterSections(args: {
  bookId: string;
  userId: string;
  storage: StorageAdapter;
  chapterTitles?: Map<number, string>;
}): Promise<AssembledChapters> {
  const { db } = await import("@/lib/db");
  const chapters = await db.chapter.findMany({
    where: { bookId: args.bookId },
    orderBy: { chapterNumber: "asc" },
    // createdAt + wordCount feed the D-190 orphan guard below.
    select: {
      chapterNumber: true,
      actNumber: true,
      createdAt: true,
      wordCount: true,
    },
  });

  // No chapter rows at all (legacy/pre-DB books): nothing to order by, so the
  // path-derived assembly is the only option — and with no DB numbers there is
  // no reorder for it to disagree with.
  if (chapters.length === 0) {
    return assembleChaptersFromStorage(args.storage, args.chapterTitles);
  }

  const { DocumentService } = await import("@/lib/documents");
  const svc = new DocumentService(args.userId, args.bookId);

  const chapterParts: string[] = [];
  let currentAct: number | null = null;
  let resolvedCount = 0;

  for (const chapter of chapters) {
    const doc = await svc.findByType(
      DocumentType.CHAPTER_CONTENT,
      chapter.chapterNumber
    );
    if (!doc) continue;

    // D-190/D-115: a document left behind by a DELETED chapter that held this
    // number is not this chapter's prose. Export resolves content exactly like
    // the editor's GET, so it honours the same guard — otherwise deleted words
    // ship inside the finished manuscript.
    if (
      isOrphanedChapterContent({
        docCreatedAt: doc.createdAt,
        chapterCreatedAt: chapter.createdAt,
        chapterWordCount: chapter.wordCount,
      })
    ) {
      continue;
    }

    resolvedCount++;

    // readPinned pairs currentVersion with that exact version's snapshot —
    // the same read the editor's GET uses, so the export matches what the
    // writer last saw. Empty/missing content skips the chapter (never crashes).
    const stored = await svc.readPinned(doc.id);
    const content = stored?.content ?? "";
    if (!content) continue;

    // Act divider when the DB act changes (never before the first chapter).
    if (chapter.actNumber !== null && chapter.actNumber !== currentAct) {
      const isFirstPart = chapterParts.length === 0;
      currentAct = chapter.actNumber;
      if (!isFirstPart) {
        chapterParts.push(
          `\n\\newpage\n\n::: {.act-divider}\n## Act ${chapter.actNumber}\n:::\n`
        );
      }
    }

    // Strip YAML front matter, then set the canonical chapter heading from the
    // DB title (F9/F10) — keyed by the DB chapterNumber, not the file path.
    let cleaned = content.replace(/^---\n[\s\S]*?\n---\n/, "");
    cleaned = applyChapterHeading(
      cleaned,
      chapter.chapterNumber,
      args.chapterTitles?.get(chapter.chapterNumber)
    );

    if (chapterParts.length > 0) {
      chapterParts.push("\n\\newpage\n");
    }
    chapterParts.push(cleaned);
  }

  // Chapter rows exist but none has a content document (e.g. imports that
  // predate document rows) — fall back to the storage listing rather than
  // exporting an empty manuscript.
  if (resolvedCount === 0) {
    return assembleChaptersFromStorage(args.storage, args.chapterTitles);
  }

  return {
    chapterContent: chapterParts.join("\n\n"),
    chapterCount: resolvedCount,
  };
}

/**
 * Legacy path-derived assembly — retained ONLY as the fallback for books with
 * no usable DB chapter/document rows (see assembleChapterSections). Chapter
 * number and act both come from the storage path here, which is safe only
 * because these books have no DB ordering to diverge from.
 */
async function assembleChaptersFromStorage(
  storage: StorageAdapter,
  chapterTitles?: Map<number, string>
): Promise<AssembledChapters> {
  const manuscriptFiles = await storage.list("manuscript/**/*.md");
  const sorted = manuscriptFiles
    .filter(
      (f) =>
        f.endsWith(".md") &&
        !f.includes("-DEV-EDIT") &&
        !f.includes("-LINE-EDIT") &&
        !f.includes("-BETA-READ")
    )
    .sort();

  if (sorted.length === 0) {
    throw new Error("No manuscript files found");
  }

  const chapterParts: string[] = [];
  let currentAct: string | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const content = await storage.read(sorted[i]);
    if (!content) continue;

    // Detect act boundaries
    const actMatch = sorted[i].match(/act-(\d+)/);
    if (actMatch) {
      const actDir = `act-${actMatch[1]}`;
      if (actDir !== currentAct) {
        currentAct = actDir;
        if (i > 0) {
          chapterParts.push(
            `\n\\newpage\n\n::: {.act-divider}\n## Act ${actMatch[1]}\n:::\n`
          );
        }
      }
    }

    // Strip YAML front matter, then set the canonical chapter heading from the
    // DB title (F9/F10). The chapter number is derived from the file path
    // (manuscript/act-XX/chapter-NN.md), matching DocumentType.CHAPTER_CONTENT.
    let cleaned = content.replace(/^---\n[\s\S]*?\n---\n/, "");
    const chapterMatch = sorted[i].match(/chapter-(\d+)/);
    const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : i + 1;
    cleaned = applyChapterHeading(
      cleaned,
      chapterNumber,
      chapterTitles?.get(chapterNumber)
    );

    if (i > 0) {
      chapterParts.push("\n\\newpage\n");
    }
    chapterParts.push(cleaned);
  }

  return {
    chapterContent: chapterParts.join("\n\n"),
    chapterCount: sorted.length,
  };
}

/**
 * Export manuscript using the full WMB pipeline.
 * Supports DOCX, PDF (Typst), and EPUB3 with 7 Lua filters,
 * front/back matter, language formatting, and template support.
 *
 * Since files live in S3, this function:
 * 1. Reads all content from storage
 * 2. Writes assembled markdown to a temp file
 * 3. Runs Pandoc on the temp file
 * 4. Reads the output and uploads to S3
 * 5. Cleans up temp files
 */
export async function exportManuscript(
  options: ExportOptions,
  storage: StorageAdapter,
  bookName: string,
  language: string = "en"
): Promise<ExportResult> {
  const {
    format = "docx",
    isDraft = false,
    template,
    chapterTitles,
  } = options;

  const warnings: string[] = [];

  // 1. Load export config from storage
  let config: ExportConfig;
  const configContent = await storage.read(".planning/EXPORT-CONFIG.json");
  if (configContent) {
    try {
      config = parseExportConfigJson(configContent);
    } catch {
      config = getDefaultExportConfig(bookName);
      warnings.push("Export config was invalid JSON, using defaults.");
    }
  } else {
    config = getDefaultExportConfig(bookName);
  }

  const sceneBreakGlyph = options.sceneBreakGlyph ?? config.sceneBreakGlyph ?? "***";
  const genreTemplate = template ?? config.format.genreTemplate ?? "genre";

  // 2. Get language formatting
  const langConfig = getExportFormatConfig(language);

  // 3. Assemble front matter
  const frontMatter =
    options.omnibus && options.seriesTitle
      ? await assembleSeriesFrontMatter(
          config,
          options.seriesTitle,
          options.bookList ?? [],
          format
        )
      : await assembleFrontMatter(config, storage, format);

  // 4. Assemble chapters in DB order (D-03) — storage paths are never renamed
  //    on reorder, so chapter identity must come from the DB, not a path sort.
  const { chapterContent, chapterCount } = await assembleChapterSections({
    bookId: options.bookId,
    userId: options.userId,
    storage,
    chapterTitles,
  });

  // 5. Assemble back matter
  const backMatterResult = await assembleBackMatter(config, storage);
  warnings.push(...backMatterResult.warnings);

  // 6. Generate YAML metadata block
  // Typst (PDF engine) uses "us-letter" instead of "letter"
  const paperSize =
    format === "pdf" && langConfig.pageSize === "letter"
      ? "us-letter"
      : langConfig.pageSize;
  const yamlMeta = [
    "---",
    `title: "${config.metadata.title || bookName}"`,
    config.metadata.author ? `author: "${config.metadata.author}"` : "",
    `lang: ${language}`,
    `scene-break-ornament: "${sceneBreakGlyph}"`,
    `papersize: ${paperSize}`,
    `mainfont: "${langConfig.bodyFont}"`,
    `linestretch: ${langConfig.lineSpacing}`,
    isDraft ? `draft: true` : "",
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  // 7. Combine all sections
  const combinedMd = [yamlMeta, frontMatter, chapterContent, backMatterResult.content]
    .filter(Boolean)
    .join("\n\n");

  // Calculate stats
  const wordCount = combinedMd
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/[#*_\-\[\](){}:>|`~]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  // Approximate RENDERED-page estimate, not submission-manuscript pages
  // (front-matter offset + observed body density; see estimateRenderedPages).
  const estimatedPages = estimateRenderedPages(wordCount);

  // 8. Write to temp filesystem, run Pandoc, upload result
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sanitizedName = sanitizeExportFilename(bookName);
  const outputFilename = `${sanitizedName}-${timestamp}.${format}`;
  const storageKey = `exports/${outputFilename}`;

  // Require Pandoc - throw actionable error if missing
  await requireTool("pandoc");

  // Create temp directory for Pandoc I/O
  const tmpDir = join(tmpdir(), `wmb-export-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const inputPath = join(tmpDir, "manuscript.md");
  const outputPath = join(tmpDir, outputFilename);

  await writeFile(inputPath, combinedMd, "utf-8");

  // 9. Build Pandoc command
  const luaFilters = [
    "scene-break.lua",
    "first-para.lua",
    "pagebreak.lua",
    "epigraph.lua",
    "special-format.lua",
  ];
  if (!isDraft) luaFilters.push("recto-start.lua");
  if (isDraft) luaFilters.push("draft-watermark.lua");

  const luaFilterPaths = luaFilters.map((f) => join(LUA_FILTERS_DIR, f));

  // Resolve every format-specific path (default template/reference/css lookups
  // with their try/readFile fallbacks, and the typst engine) BEFORE building the
  // argv — buildPandocArgs itself is a pure function that only assembles the
  // array. requireTool("pandoc") above has already populated resolvedToolPaths.
  const pandocCmd = resolvedToolPaths["pandoc"] || "pandoc";

  let referenceDoc: string | null = null;
  let typstEngine: string | null = null;
  let typstTemplate: string | null = null;
  let epubCss: string | null = null;
  let epubCoverImage: string | null = null;

  // D-21 defense-in-depth: every writer-settable custom template / cover path is
  // re-validated here (resolveSafeTemplatePath → absolute path inside
  // export-templates, or null) so a URL/UNC/absolute/traversal value can never
  // reach pandoc even if it slipped past the config validation boundary. A
  // non-empty-but-rejected value falls back to the bundled default and warns.
  if (format === "docx") {
    const customRef = resolveSafeTemplatePath(config.customTemplates.docxReference);
    if (customRef) {
      referenceDoc = customRef;
    } else {
      if (config.customTemplates.docxReference) {
        warnings.push(
          "Custom docx reference ignored: not inside the allowed templates directory."
        );
      }
      const refDocPath = join(TEMPLATES_DIR, `reference-${genreTemplate}.docx`);
      try {
        await readFile(refDocPath);
        referenceDoc = refDocPath;
      } catch {
        // No reference doc available
      }
    }
  } else if (format === "pdf") {
    // Require Typst for PDF export - throw actionable error if missing
    await requireTool("typst");
    typstEngine = resolvedToolPaths["typst"] || "typst";
    const customTpl = resolveSafeTemplatePath(config.customTemplates.typstTemplate);
    if (!customTpl && config.customTemplates.typstTemplate) {
      warnings.push(
        "Custom typst template ignored: not inside the allowed templates directory."
      );
    }
    const templatePath = customTpl || join(TEMPLATES_DIR, "typst-book.typ");
    try {
      await readFile(templatePath);
      typstTemplate = templatePath;
    } catch {
      // Template not found, Pandoc will use default
    }
  } else if (format === "epub") {
    const customCss = resolveSafeTemplatePath(config.customTemplates.epubCss);
    if (customCss) {
      epubCss = customCss;
    } else {
      if (config.customTemplates.epubCss) {
        warnings.push(
          "Custom epub CSS ignored: not inside the allowed templates directory."
        );
      }
      const defaultCss = join(TEMPLATES_DIR, "epub-genre.css");
      try {
        await readFile(defaultCss);
        epubCss = defaultCss;
      } catch {
        // No CSS available
      }
    }
    if (config.frontMatter.coverPage && config.frontMatter.coverImagePath) {
      const cover = resolveSafeTemplatePath(config.frontMatter.coverImagePath);
      if (cover) {
        epubCoverImage = cover;
      } else {
        warnings.push(
          "Cover image ignored: not inside the allowed templates directory."
        );
      }
    }
  }

  const pandocArgs = buildPandocArgs({
    pandocCmd,
    inputPath,
    outputPath,
    format,
    luaFilterPaths,
    title: config.metadata.title || bookName,
    sceneBreakGlyph,
    referenceDoc,
    typstEngine,
    typstTemplate,
    epubCss,
    epubCoverImage,
  });

  // 10. Execute Pandoc via execFile — argv array, NO shell (D-18). pandocArgs[0]
  //     is the executable; the rest are passed to the OS verbatim.
  //     H2 (persona campaign): run with cwd = the export temp dir. Pandoc
  //     resolves some intermediate temp files relative to CWD (the musl build
  //     ignores TMPDIR), and the container's default cwd is the read-only /app —
  //     PDF silently degraded to markdown. The export dir is always writable.
  try {
    await execFileAsync(pandocArgs[0], pandocArgs.slice(1), { timeout: 120000, cwd: dirname(inputPath) });

    // Read output file and upload to S3
    let outputBuffer: Buffer = await readFile(outputPath);
    // F10: pandoc copies each EPUB split filename (chNNN.xhtml) into that file's
    // <title>; rewrite them to the chapter heading. Best-effort — on any failure
    // keep the original (already-valid) EPUB rather than risk a corrupt archive.
    if (format === "epub") {
      try {
        outputBuffer = await rewriteEpubChapterTitles(outputBuffer);
      } catch (e) {
        warnings.push(
          `EPUB chapter-title rewrite skipped: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
    const contentType =
      format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : format === "pdf"
          ? "application/pdf"
          : "application/epub+zip";
    await storage.writeBuffer(storageKey, outputBuffer, contentType);
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    // Fallback to markdown on Pandoc error
    const fallbackName = outputFilename.replace(`.${format}`, ".md");
    const fallbackKey = `exports/${fallbackName}`;
    await storage.write(fallbackKey, combinedMd);
    warnings.push(`Pandoc export failed (${err}). Saved as markdown.`);

    // Cleanup temp dir
    await cleanupTemp(tmpDir, inputPath, outputPath);

    return {
      filename: fallbackName,
      storageKey: fallbackKey,
      wordCount,
      chapterCount,
      estimatedPages,
      warnings,
      format: "md",
    };
  }

  // 11. Cleanup temp files
  await cleanupTemp(tmpDir, inputPath, outputPath);

  return {
    filename: outputFilename,
    storageKey: storageKey,
    wordCount,
    chapterCount,
    estimatedPages,
    warnings,
    format,
  };
}

async function cleanupTemp(
  tmpDir: string,
  inputPath: string,
  outputPath: string
) {
  try {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    const { rmdir } = await import("fs/promises");
    await rmdir(tmpDir).catch(() => {});
  } catch {
    // Best-effort cleanup
  }
}
