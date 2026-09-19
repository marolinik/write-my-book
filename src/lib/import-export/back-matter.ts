import type { StorageAdapter } from "@/lib/storage/types";
import type { ExportConfig } from "./types";
import { getExportStrings } from "./export-strings";

interface BackMatterResult {
  content: string;
  warnings: string[];
}

/** Assemble back matter sections (About Author, Also By, Acknowledgments). */
export async function assembleBackMatter(
  config: ExportConfig,
  storage: StorageAdapter,
  /** The BOOK's language — these headings are printed in the finished book. */
  language?: string | null
): Promise<BackMatterResult> {
  const parts: string[] = [];
  const warnings: string[] = [];
  const { backMatter } = config;
  const strings = getExportStrings(language);

  // About the Author
  if (backMatter.aboutAuthor) {
    if (backMatter.aboutAuthorPath) {
      const content = await storage.read(backMatter.aboutAuthorPath);
      if (content) {
        parts.push("\\newpage");
        parts.push(`::: {.about-author}\n\n## ${strings.aboutTheAuthor}\n\n${content.trim()}\n\n:::`);
      } else {
        warnings.push(
          `About the Author is enabled but file not found: ${backMatter.aboutAuthorPath}`
        );
      }
    } else {
      warnings.push("About the Author is enabled but no file path configured");
    }
  }

  // Also By
  if (backMatter.alsoBy) {
    if (backMatter.alsoByPath) {
      const content = await storage.read(backMatter.alsoByPath);
      if (content) {
        parts.push("\\newpage");
        parts.push(
          `::: {.also-by}\n\n## ${strings.alsoBy} ${config.metadata.author || ""}\n\n${content.trim()}\n\n:::`
        );
      } else {
        warnings.push(
          `Also By is enabled but file not found: ${backMatter.alsoByPath}`
        );
      }
    } else {
      warnings.push("Also By is enabled but no file path configured");
    }
  }

  // Acknowledgments
  if (backMatter.acknowledgments) {
    if (backMatter.acknowledgmentsPath) {
      const content = await storage.read(backMatter.acknowledgmentsPath);
      if (content) {
        parts.push("\\newpage");
        parts.push(
          `::: {.acknowledgments}\n\n## ${strings.acknowledgments}\n\n${content.trim()}\n\n:::`
        );
      } else {
        warnings.push(
          `Acknowledgments is enabled but file not found: ${backMatter.acknowledgmentsPath}`
        );
      }
    } else {
      warnings.push("Acknowledgments is enabled but no file path configured");
    }
  }

  return { content: parts.join("\n\n"), warnings };
}
