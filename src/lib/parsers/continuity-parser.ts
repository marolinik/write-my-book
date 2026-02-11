/**
 * Parser for continuity checker output.
 * Reads CONTINUITY.md report and data files from continuity/ directory.
 */

import type {
  ChekhovGun,
  ContinuityData,
  SubplotTrack,
  TimelineEvent,
} from "./types";

export function parseContinuityReport(
  reportContent: string,
  timelineContent?: string | null,
  subplotsContent?: string | null,
  foreshadowingContent?: string | null
): ContinuityData {
  return {
    timeline: parseTimeline(reportContent, timelineContent),
    subplots: parseSubplots(reportContent, subplotsContent),
    chekhovGuns: parseChekhovGuns(reportContent, foreshadowingContent),
    findingsCount: countFindings(reportContent),
  };
}

function parseTimeline(
  report: string,
  dataFile?: string | null
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Try data file first
  const content = dataFile || report;

  // Parse timeline entries from markdown table or list format
  const lines = content.split("\n");

  for (const line of lines) {
    // Table row format: | Ch | Event | Character | Status |
    if (line.includes("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 3) continue;

      const chMatch = cells[0].match(/(\d+)/);
      if (!chMatch) continue;

      const chapter = parseInt(chMatch[1], 10);
      const event = cells[1];
      const character = cells[2];
      const statusCell = (cells[3] || "").toLowerCase();

      let status: TimelineEvent["status"] = "ok";
      if (
        statusCell.includes("error") ||
        statusCell.includes("critical") ||
        statusCell.includes("contradict")
      ) {
        status = "error";
      } else if (
        statusCell.includes("warning") ||
        statusCell.includes("note") ||
        statusCell.includes("minor")
      ) {
        status = "warning";
      }

      events.push({ chapter, event, character, status });
    }

    // List format: - **Chapter N:** Event description
    const listMatch = line.match(
      /^[-*]\s+\*?\*?Chapter\s+(\d+)\*?\*?:?\s+(.+)/i
    );
    if (listMatch && !line.includes("|")) {
      events.push({
        chapter: parseInt(listMatch[1], 10),
        event: listMatch[2].trim(),
        character: "",
        status: line.toLowerCase().includes("contradict") ||
          line.toLowerCase().includes("error")
          ? "error"
          : line.toLowerCase().includes("warning")
            ? "warning"
            : "ok",
      });
    }
  }

  return events;
}

function parseSubplots(
  report: string,
  dataFile?: string | null
): SubplotTrack[] {
  const subplots: SubplotTrack[] = [];
  const content = dataFile || report;

  // Find subplot section
  const sectionMatch = content.match(
    /(?:## Subplot|### Subplot|## Thread).*?\n([\s\S]*?)(?=\n## |\n---\s*$|$)/i
  );
  const section = sectionMatch ? sectionMatch[1] : content;

  const lines = section.split("\n");

  for (const line of lines) {
    // Table format: | Name | Introduced | Last Mentioned | Status |
    if (line.includes("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 3) continue;

      const name = cells[0];
      if (
        name.toLowerCase().includes("name") ||
        name.toLowerCase().includes("subplot") ||
        name.includes("-")
      )
        continue;

      const introduced = parseInt(cells[1], 10);
      if (isNaN(introduced)) continue;

      const lastMentioned = parseInt(cells[2], 10) || introduced;
      const statusCell = (cells[3] || "").toLowerCase();

      let status: SubplotTrack["status"] = "active";
      if (statusCell.includes("dormant") || statusCell.includes("stalled")) {
        status = "dormant";
      } else if (
        statusCell.includes("resolved") ||
        statusCell.includes("complete")
      ) {
        status = "resolved";
      }

      subplots.push({ name, introduced, lastMentioned, status });
    }
  }

  return subplots;
}

function parseChekhovGuns(
  report: string,
  dataFile?: string | null
): ChekhovGun[] {
  const guns: ChekhovGun[] = [];
  const content = dataFile || report;

  // Find foreshadowing/Chekhov section
  const sectionMatch = content.match(
    /(?:## Chekhov|### Chekhov|## Foreshadowing|### Foreshadowing).*?\n([\s\S]*?)(?=\n## |\n---\s*$|$)/i
  );
  const section = sectionMatch ? sectionMatch[1] : content;

  const lines = section.split("\n");

  for (const line of lines) {
    if (line.includes("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 3) continue;

      const item = cells[0];
      if (
        item.toLowerCase().includes("item") ||
        item.toLowerCase().includes("seed") ||
        item.includes("-")
      )
        continue;

      const chapter = parseInt(cells[1], 10);
      if (isNaN(chapter)) continue;

      const density = parseFloat(cells[2]) || 0;
      const statusCell = (cells[3] || "").toLowerCase();

      const status: ChekhovGun["status"] =
        statusCell.includes("fired") || statusCell.includes("resolved")
          ? "fired"
          : "unfired";

      guns.push({ item, chapter, density, status });
    }
  }

  return guns;
}

function countFindings(report: string): number {
  // Count findings from the report (Critical + Warning mentions)
  const criticalMatches = report.match(/critical/gi);
  const warningMatches = report.match(/warning/gi);
  return (criticalMatches?.length ?? 0) + (warningMatches?.length ?? 0);
}
