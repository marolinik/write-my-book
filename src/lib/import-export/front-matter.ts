import type { StorageAdapter } from "@/lib/storage/types";
import type { ExportConfig } from "./types";

/** Assemble front matter for a single-book export. */
export async function assembleFrontMatter(
  config: ExportConfig,
  storage: StorageAdapter,
  format: string
): Promise<string> {
  const parts: string[] = [];
  const { metadata, frontMatter } = config;

  // Cover page (EPUB/PDF only)
  if (frontMatter.coverPage && frontMatter.coverImagePath && format !== "docx") {
    parts.push(`::: {.cover-page}\n![Cover](${frontMatter.coverImagePath})\n:::`);
    parts.push("\\newpage");
  }

  // Half-title page
  if (frontMatter.halfTitle) {
    parts.push(`::: {.half-title}\n\n# ${metadata.title}\n\n:::`);
    parts.push("\\newpage");
  }

  // Title page
  if (frontMatter.titlePage) {
    const titleParts = [`::: {.title-page}`, "", `# ${metadata.title}`];
    if (metadata.subtitle) {
      titleParts.push("", `## ${metadata.subtitle}`);
    }
    if (metadata.author) {
      titleParts.push("", `### ${metadata.author}`);
    }
    if (metadata.publisher) {
      titleParts.push("", metadata.publisher);
    }
    titleParts.push("", ":::");
    parts.push(titleParts.join("\n"));
    parts.push("\\newpage");
  }

  // Copyright page
  if (frontMatter.copyrightPage) {
    const year = metadata.copyrightYear || new Date().getFullYear().toString();
    const author = metadata.author || "the author";
    const copyrightLines = [
      `::: {.copyright-page}`,
      "",
      `Copyright \u00A9 ${year} ${author}`,
      "",
      "All rights reserved.",
      "",
      "No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of the author, except in the case of brief quotations embodied in critical reviews.",
    ];
    if (metadata.isbn) {
      copyrightLines.push("", `ISBN: ${metadata.isbn}`);
    }
    if (metadata.publisher) {
      copyrightLines.push("", `Published by ${metadata.publisher}`);
    }
    copyrightLines.push("", ":::");
    parts.push(copyrightLines.join("\n"));
    parts.push("\\newpage");
  }

  // Dedication
  if (frontMatter.dedication && frontMatter.dedicationPath) {
    const dedication = await storage.read(frontMatter.dedicationPath);
    if (dedication) {
      parts.push(`::: {.dedication}\n\n${dedication.trim()}\n\n:::`);
      parts.push("\\newpage");
    }
  }

  // Table of contents marker
  if (frontMatter.tableOfContents) {
    parts.push(`::: {.toc}\n\n\\tableofcontents\n\n:::`);
    parts.push("\\newpage");
  }

  return parts.join("\n\n");
}

/** Assemble series-level front matter for omnibus exports. */
export async function assembleSeriesFrontMatter(
  config: ExportConfig,
  seriesTitle: string,
  bookList: { bookNumber: number; title: string }[],
  format: string
): Promise<string> {
  const parts: string[] = [];
  const { metadata, frontMatter } = config;

  // Cover page
  if (frontMatter.coverPage && frontMatter.coverImagePath && format !== "docx") {
    parts.push(`::: {.cover-page}\n![Cover](${frontMatter.coverImagePath})\n:::`);
    parts.push("\\newpage");
  }

  // Series title page
  const titleParts = [`::: {.title-page}`, "", `# ${seriesTitle}`, "", "## Complete Series"];
  if (metadata.author) {
    titleParts.push("", `### ${metadata.author}`);
  }
  if (bookList.length > 0) {
    titleParts.push("", "---", "");
    for (const book of bookList) {
      titleParts.push(`Book ${book.bookNumber}: *${book.title}*  `);
    }
  }
  if (metadata.publisher) {
    titleParts.push("", metadata.publisher);
  }
  titleParts.push("", ":::");
  parts.push(titleParts.join("\n"));
  parts.push("\\newpage");

  // Copyright page
  if (frontMatter.copyrightPage) {
    const year = metadata.copyrightYear || new Date().getFullYear().toString();
    const author = metadata.author || "the author";
    parts.push(
      [
        `::: {.copyright-page}`,
        "",
        `Copyright \u00A9 ${year} ${author}`,
        "",
        "All rights reserved.",
        "",
        ":::",
      ].join("\n")
    );
    parts.push("\\newpage");
  }

  // TOC
  if (frontMatter.tableOfContents) {
    parts.push(`::: {.toc}\n\n\\tableofcontents\n\n:::`);
    parts.push("\\newpage");
  }

  return parts.join("\n\n");
}
