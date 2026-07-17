import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { DocumentType } from "@/generated/prisma/enums";
import type { StorageAdapter } from "@/lib/storage/types";
import type { ExportConfig, ExportOptions, ExportResult } from "./types";
import { getDefaultExportConfig, parseExportConfigJson } from "./export-config";
import { getExportFormatConfig } from "./language-config";
import { assembleFrontMatter, assembleSeriesFrontMatter } from "./front-matter";
import { assembleBackMatter } from "./back-matter";

const execAsync = promisify(exec);

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

/** Get the resolved path for a tool, or just the name if on PATH. */
function getToolCmd(name: string): string {
  return resolvedToolPaths[name] ? `"${resolvedToolPaths[name]}"` : name;
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
    select: { chapterNumber: true, actNumber: true },
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
  // Approximate RENDERED-page estimate, not submission-manuscript pages. The 250
  // w/pg convention overshoots the actual export (a 6187-word book rendered to a
  // 17-page PDF, ~364 w/pg); 350 tracks the observed rendered density (B3).
  const estimatedPages = Math.ceil(wordCount / 350);

  // 8. Write to temp filesystem, run Pandoc, upload result
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sanitizedName = bookName
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-");
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

  const filterArgs = luaFilters
    .map((f) => `--lua-filter="${join(LUA_FILTERS_DIR, f)}"`)
    .join(" ");

  const cmdParts = [
    getToolCmd("pandoc"),
    `"${inputPath}"`,
    "-o",
    `"${outputPath}"`,
    "--from=markdown",
    filterArgs,
    `--metadata=title:"${config.metadata.title || bookName}"`,
    `--variable=scene-break-glyph:"${sceneBreakGlyph}"`,
    "--standalone",
  ];

  if (format === "docx") {
    cmdParts.push("--to=docx");
    if (config.customTemplates.docxReference) {
      cmdParts.push(`--reference-doc="${config.customTemplates.docxReference}"`);
    } else {
      const refDocPath = join(TEMPLATES_DIR, `reference-${genreTemplate}.docx`);
      try {
        await readFile(refDocPath);
        cmdParts.push(`--reference-doc="${refDocPath}"`);
      } catch {
        // No reference doc available
      }
    }
  } else if (format === "pdf") {
    // Require Typst for PDF export - throw actionable error if missing
    await requireTool("typst");
    const typstCmd = resolvedToolPaths["typst"] || "typst";
    cmdParts.push(`--pdf-engine=${typstCmd}`);
    const typstTemplate =
      config.customTemplates.typstTemplate || join(TEMPLATES_DIR, "typst-book.typ");
    try {
      await readFile(typstTemplate);
      cmdParts.push(`--template="${typstTemplate}"`);
    } catch {
      // Template not found, Pandoc will use default
    }
    cmdParts.push("--to=pdf");
  } else if (format === "epub") {
    cmdParts.push("-t", "epub3");
    cmdParts.push("--split-level=1");
    if (config.customTemplates.epubCss) {
      cmdParts.push(`--css="${config.customTemplates.epubCss}"`);
    } else {
      const defaultCss = join(TEMPLATES_DIR, "epub-genre.css");
      try {
        await readFile(defaultCss);
        cmdParts.push(`--css="${defaultCss}"`);
      } catch {
        // No CSS available
      }
    }
    if (config.frontMatter.coverPage && config.frontMatter.coverImagePath) {
      cmdParts.push(`--epub-cover-image="${config.frontMatter.coverImagePath}"`);
    }
  }

  const cmd = cmdParts.join(" ");

  // 10. Execute Pandoc
  try {
    await execAsync(cmd, { timeout: 120000 });

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
