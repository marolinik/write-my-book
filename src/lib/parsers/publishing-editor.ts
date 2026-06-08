/**
 * Parser for PUBLISHING-EDIT.md reports produced by the publishing editor agent.
 * Extracts findings, statistics, and auto-fix summary.
 */

import type {
  PubEditorAutoFix,
  PubEditorData,
  PubEditorFinding,
} from "./types";

export function parsePublishingEditorReport(content: string): PubEditorData {
  const data: PubEditorData = {
    checksRun: 0,
    totalFindings: 0,
    warningCount: 0,
    infoCount: 0,
    autoFixCount: 0,
    findings: [],
    stats: {
      totalWordCount: 0,
      chapterCount: 0,
      avgChapterLength: 0,
      estimatedPages: 0,
      estimatedReadingTime: "",
    },
    autoFixes: [],
  };

  // Parse Export Summary table
  const checksMatch = content.match(/Checks run\s*\|\s*(\d+)/i);
  if (checksMatch) data.checksRun = parseInt(checksMatch[1], 10);

  const totalFindingsMatch = content.match(/Total findings\s*\|\s*(\d+)/i);
  if (totalFindingsMatch) data.totalFindings = parseInt(totalFindingsMatch[1], 10);

  const warningMatch = content.match(/(\d+)\s*Warning/i);
  if (warningMatch) data.warningCount = parseInt(warningMatch[1], 10);

  const infoMatch = content.match(/(\d+)\s*Info/i);
  if (infoMatch) data.infoCount = parseInt(infoMatch[1], 10);

  const autoFixMatch = content.match(/Auto-fixes applied\s*\|\s*(\d+)/i);
  if (autoFixMatch) data.autoFixCount = parseInt(autoFixMatch[1], 10);

  // Parse Manuscript Statistics
  const wordCountMatch = content.match(/Total word count\s*\|\s*([\d,]+)/i);
  if (wordCountMatch) data.stats.totalWordCount = parseInt(wordCountMatch[1].replace(/,/g, ""), 10);

  const chapterCountMatch = content.match(/Chapter count\s*\|\s*(\d+)/i);
  if (chapterCountMatch) data.stats.chapterCount = parseInt(chapterCountMatch[1], 10);

  const avgMatch = content.match(/Average chapter length\s*\|\s*([\d,]+)/i);
  if (avgMatch) data.stats.avgChapterLength = parseInt(avgMatch[1].replace(/,/g, ""), 10);

  const pagesMatch = content.match(/Estimated page count\s*\|\s*([\d,]+)/i);
  if (pagesMatch) data.stats.estimatedPages = parseInt(pagesMatch[1].replace(/,/g, ""), 10);

  const readingMatch = content.match(/Estimated reading time\s*\|\s*([^|]+)/i);
  if (readingMatch) data.stats.estimatedReadingTime = readingMatch[1].trim();

  // Parse Auto-Fix Summary table rows
  const autoFixSection = content.match(/## Auto-Fix Summary[\s\S]*?(?=\n## |$)/i)?.[0] ?? "";
  const autoFixRows = autoFixSection.match(/\|[^|]+\|[^|]+\|[^|]+\|/g) ?? [];
  for (const row of autoFixRows) {
    const cells = row.split("|").filter(Boolean).map((c) => c.trim());
    if (cells.length >= 3 && !cells[0].startsWith("-") && cells[0] !== "Category" && cells[0] !== "**Total**") {
      const changes = parseInt(cells[1].replace(/,/g, ""), 10);
      if (!isNaN(changes) && changes > 0) {
        data.autoFixes.push({
          category: cells[0],
          changes,
          details: cells[2],
        });
      }
    }
  }

  // Parse individual findings
  const findingSections = content.match(/####\s+(PE-\d+):\s*[\s\S]+?(?=\n####|\n---\n## |$)/g) ?? [];
  for (const section of findingSections) {
    const idMatch = section.match(/####\s+(PE-\d+):\s*(.+)/);
    if (!idMatch) continue;

    const finding: PubEditorFinding = {
      checkId: idMatch[1],
      checkName: idMatch[2].trim(),
      severity: "Info",
      category: "",
      chapter: "",
      location: "",
      issue: "",
      recommendation: "",
      disposition: "Pending",
    };

    const severityMatch = section.match(/\*\*Severity:\*\*\s*(\w+)/i);
    if (severityMatch) finding.severity = severityMatch[1] as "Warning" | "Info";

    const catMatch = section.match(/\*\*Category:\*\*\s*(.+)/i);
    if (catMatch) finding.category = catMatch[1].trim();

    const chapterMatch = section.match(/\*\*Chapter:\*\*\s*(.+)/i);
    if (chapterMatch) finding.chapter = chapterMatch[1].trim();

    const locMatch = section.match(/\*\*Location:\*\*\s*(.+)/i);
    if (locMatch) finding.location = locMatch[1].trim();

    const issueMatch = section.match(/\*\*Issue:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i);
    if (issueMatch) finding.issue = issueMatch[1].trim();

    const recMatch = section.match(/\*\*Recommendation:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i);
    if (recMatch) finding.recommendation = recMatch[1].trim();

    const dispMatch = section.match(/\*\*Disposition:\*\*\s*(\w+)/i);
    if (dispMatch) finding.disposition = dispMatch[1].trim();

    const dismissMatch = section.match(/\*\*Reason:\*\*\s*"?([^"]+)"?/i);
    if (dismissMatch) finding.dismissReason = dismissMatch[1].trim();

    data.findings.push(finding);
  }

  return data;
}
