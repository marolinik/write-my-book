/**
 * Parser for cross-book series continuity report.
 * Reads series/SERIES-CONTINUITY.md and extracts structured findings.
 */

import type { SeriesContinuityData, SeriesContinuityFinding } from "./types";

export function parseSeriesContinuityReport(content: string): SeriesContinuityData {
  const findings: SeriesContinuityFinding[] = [];
  const lines = content.split("\n");
  let booksChecked = 0;

  for (const line of lines) {
    // Count books mentioned: "## Book NN" or "### Book NN"
    const bookHeaderMatch = line.match(/^#{2,3}\s+Book\s+(\d+)/i);
    if (bookHeaderMatch) {
      const bn = parseInt(bookHeaderMatch[1], 10);
      if (bn > booksChecked) booksChecked = bn;
    }

    // Parse table row: | Severity | Book | Chapter | Category | Description |
    if (line.includes("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 4) continue;

      const sevText = cells[0].toLowerCase();
      let severity: SeriesContinuityFinding["severity"] = "minor";
      if (sevText.includes("critical")) severity = "critical";
      else if (sevText.includes("major")) severity = "major";

      const bookMatch = cells[1].match(/(\d+)/);
      if (!bookMatch) continue;
      const bookNumber = parseInt(bookMatch[1], 10);
      if (isNaN(bookNumber)) continue;

      const chapterMatch = cells[2].match(/(\d+)/);
      const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : null;

      const category = cells.length >= 5 ? cells[3] : "general";
      const description = cells.length >= 5 ? cells[4] : cells[3];

      // Skip header rows
      if (
        category.toLowerCase().includes("category") ||
        description.toLowerCase().includes("description") ||
        category.includes("-")
      ) {
        continue;
      }

      findings.push({
        severity,
        bookNumber,
        chapterNumber,
        category,
        description,
      });
    }

    // List format: - **[CRITICAL]** [Book 2, Ch 5] Category: Description
    const listMatch = line.match(
      /^[-*]\s+\*?\*?\[?(CRITICAL|MAJOR|MINOR)\]?\*?\*?\s+\[?Book\s+(\d+)(?:,\s*Ch(?:apter)?\s*(\d+))?\]?\s*(.+)/i
    );
    if (listMatch) {
      const sev = listMatch[1].toLowerCase() as SeriesContinuityFinding["severity"];
      const bookNumber = parseInt(listMatch[2], 10);
      const chapterNumber = listMatch[3] ? parseInt(listMatch[3], 10) : null;
      const rest = listMatch[4];

      const catMatch = rest.match(/^([^:]+):\s*(.+)/);
      const category = catMatch ? catMatch[1].trim() : "general";
      const description = catMatch ? catMatch[2].trim() : rest.trim();

      findings.push({
        severity: sev,
        bookNumber,
        chapterNumber,
        category,
        description,
      });
    }
  }

  return {
    findings,
    totalBooks: booksChecked,
    booksChecked,
  };
}
