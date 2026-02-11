/**
 * Parser for dev-edit and line-edit report markdown files.
 * Extracts findings with severity, category, description, suggestion, and locations.
 */

import type { EditFindingParsed } from "./types";

/**
 * Parse a DEV-EDIT.md or LINE-EDIT.md report into structured findings.
 */
export function parseEditReport(content: string): EditFindingParsed[] {
  const findings: EditFindingParsed[] = [];

  // Find individual finding sections
  // Pattern: ### Finding N: Description / ### DE-NN: Description / ### LE-NN: Description
  const sections = content.split(/^###\s+/m).slice(1);

  for (const section of sections) {
    const finding = parseFindingSection(section);
    if (finding) findings.push(finding);
  }

  return findings;
}

function parseFindingSection(section: string): EditFindingParsed | null {
  const lines = section.split("\n");
  if (lines.length === 0) return null;

  const headerLine = lines[0];

  // Skip non-finding sections (like metadata headers)
  if (
    headerLine.toLowerCase().includes("executive summary") ||
    headerLine.toLowerCase().includes("fingerprint") ||
    headerLine.toLowerCase().includes("metadata") ||
    headerLine.toLowerCase().includes("overall")
  ) {
    return null;
  }

  // Extract severity from the section
  const severityMatch = section.match(
    /\*?\*?Severity\*?\*?:?\s*(critical|major|moderate|minor)/i
  );
  const severity = severityMatch
    ? (severityMatch[1].toLowerCase() as EditFindingParsed["severity"])
    : inferSeverity(section);

  // Extract category
  const categoryMatch = section.match(
    /\*?\*?Category\*?\*?:?\s*([^\n*]+)/i
  );
  const category = categoryMatch
    ? categoryMatch[1].trim()
    : inferCategory(headerLine);

  // Extract description from header or body
  const description = headerLine
    .replace(/^(?:Finding\s+\d+|[DL]E-\d+)\s*[:.]?\s*/i, "")
    .replace(/\(.*?\)\s*$/, "")
    .trim();

  if (!description) return null;

  // Extract suggestion/rewrite
  const suggestionMatch = section.match(
    /\*?\*?(?:Suggest(?:ed|ion)|Rewrite|Fix|Revision)\*?\*?:?\s*\n?>?\s*(.+?)(?=\n\n|\n\*\*|\n###|$)/i
  );
  const suggestion = suggestionMatch ? suggestionMatch[1].trim() : null;

  // Extract location
  const locationMatch = section.match(
    /\*?\*?(?:Location|Passage|At|Line|Para(?:graph)?)\*?\*?:?\s*(.+)/i
  );
  const locationStart = locationMatch ? locationMatch[1].trim() : null;

  return {
    severity,
    category,
    description,
    suggestion,
    locationStart,
    locationEnd: null,
  };
}

function inferSeverity(text: string): EditFindingParsed["severity"] {
  const lower = text.toLowerCase();
  if (lower.includes("critical") || lower.includes("severe"))
    return "critical";
  if (lower.includes("major") || lower.includes("significant"))
    return "major";
  if (lower.includes("minor") || lower.includes("nit")) return "minor";
  return "moderate";
}

function inferCategory(headerLine: string): string {
  const lower = headerLine.toLowerCase();
  if (lower.includes("pacing")) return "pacing";
  if (lower.includes("dialogue")) return "dialogue";
  if (lower.includes("character")) return "character";
  if (lower.includes("plot")) return "plot";
  if (lower.includes("voice") || lower.includes("tone")) return "voice";
  if (lower.includes("anti-ai") || lower.includes("slop")) return "anti-ai";
  if (lower.includes("show") || lower.includes("tell")) return "show-tell";
  if (lower.includes("continuity")) return "continuity";
  if (lower.includes("overuse") || lower.includes("crutch")) return "overuse";
  return "general";
}
