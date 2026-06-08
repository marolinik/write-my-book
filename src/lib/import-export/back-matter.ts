import type { StorageAdapter } from "@/lib/storage/types";
import type { ExportConfig } from "./types";

interface BackMatterResult {
  content: string;
  warnings: string[];
}

/** Assemble back matter sections (About Author, Also By, Acknowledgments). */
export async function assembleBackMatter(
  config: ExportConfig,
  storage: StorageAdapter
): Promise<BackMatterResult> {
  const parts: string[] = [];
  const warnings: string[] = [];
  const { backMatter } = config;

  // About the Author
  if (backMatter.aboutAuthor) {
    if (backMatter.aboutAuthorPath) {
      const content = await storage.read(backMatter.aboutAuthorPath);
      if (content) {
        parts.push("\\newpage");
        parts.push(`::: {.about-author}\n\n## About the Author\n\n${content.trim()}\n\n:::`);
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
          `::: {.also-by}\n\n## Also By ${config.metadata.author || "the Author"}\n\n${content.trim()}\n\n:::`
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
          `::: {.acknowledgments}\n\n## Acknowledgments\n\n${content.trim()}\n\n:::`
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
