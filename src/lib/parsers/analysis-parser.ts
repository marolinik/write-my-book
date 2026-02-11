/**
 * Parser for manuscript analyst ANALYSIS.md report.
 * Extracts readability scores, pacing data, dialogue breakdown, overuse detection.
 */

import type {
  AnalysisData,
  DialogueEntry,
  OveruseEntry,
  PacingDataPoint,
  ReadabilityData,
} from "./types";

export function parseAnalysisReport(content: string): AnalysisData {
  return {
    readability: parseReadability(content),
    pacing: parsePacing(content),
    dialogue: parseDialogue(content),
    overuse: parseOveruse(content),
  };
}

function parseReadability(content: string): ReadabilityData {
  const result: ReadabilityData = {
    fleschKincaid: 0,
    fleschReadingEase: 0,
    gunningFog: 0,
    colemanLiau: 0,
    genreBenchmark: { fk: null, fre: null },
  };

  // Parse the overview table
  const tableMatch = content.match(
    /### Manuscript Overview\s*\n([\s\S]*?)(?=\n###|\n---|\n## )/i
  );
  if (!tableMatch) return result;

  const lines = tableMatch[1].split("\n").filter((l) => l.includes("|"));

  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    const label = cells[0].toLowerCase();
    const score = parseFloat(cells[1]);

    if (isNaN(score)) continue;

    if (label.includes("flesch-kincaid") && label.includes("grade")) {
      result.fleschKincaid = score;
      const benchmarkRange = parseBenchmarkRange(cells[2]);
      if (benchmarkRange) result.genreBenchmark.fk = benchmarkRange;
    } else if (label.includes("flesch") && label.includes("ease")) {
      result.fleschReadingEase = score;
      const benchmarkRange = parseBenchmarkRange(cells[2]);
      if (benchmarkRange) result.genreBenchmark.fre = benchmarkRange;
    } else if (label.includes("gunning") || label.includes("fog")) {
      result.gunningFog = score;
    } else if (label.includes("coleman") || label.includes("liau")) {
      result.colemanLiau = score;
    }
  }

  return result;
}

function parseBenchmarkRange(
  cell: string | undefined
): { min: number; max: number } | null {
  if (!cell) return null;
  const match = cell.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
  if (!match) return null;
  return { min: parseFloat(match[1]), max: parseFloat(match[2]) };
}

function parsePacing(content: string): PacingDataPoint[] {
  const data: PacingDataPoint[] = [];

  // Find the per-chapter breakdown table with tension scores
  // Look for Per-Chapter Breakdown or Pacing Analysis section
  const sectionMatch = content.match(
    /## Pacing.*?\n([\s\S]*?)(?=\n## )/i
  );
  if (!sectionMatch) {
    // Try per-chapter breakdown in readability
    return parsePacingFromChapterTable(content);
  }

  const section = sectionMatch[1];
  const lines = section.split("\n").filter((l) => l.includes("|"));

  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    // Look for chapter number and tension score
    const chMatch = cells[0].match(/(\d+)/);
    if (!chMatch) continue;

    const ch = parseInt(chMatch[1], 10);
    // Find the tension column (look for a float between 0-10)
    for (let i = 1; i < cells.length; i++) {
      const val = parseFloat(cells[i]);
      if (!isNaN(val) && val >= 0 && val <= 10) {
        data.push({
          chapter: `Ch ${ch}`,
          tension: val,
          genreAvg: null,
        });
        break;
      }
    }
  }

  return data;
}

function parsePacingFromChapterTable(content: string): PacingDataPoint[] {
  const data: PacingDataPoint[] = [];

  // Alternative: parse from chapter breakdown table
  const tableMatch = content.match(
    /### Per-Chapter Breakdown\s*\n([\s\S]*?)(?=\n###|\n---|\n## )/i
  );
  if (!tableMatch) return data;

  const lines = tableMatch[1].split("\n").filter((l) => l.includes("|"));
  if (lines.length < 3) return data;

  // Find header to locate FK column
  const header = lines[0]
    .split("|")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  const fkIdx = header.findIndex(
    (h) => h.includes("fk") || h.includes("flesch")
  );

  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const chMatch = cells[0]?.match(/(\d+)/);
    if (!chMatch) continue;

    const ch = parseInt(chMatch[1], 10);
    const val = fkIdx >= 0 ? parseFloat(cells[fkIdx]) : NaN;

    if (!isNaN(val)) {
      data.push({
        chapter: `Ch ${ch}`,
        tension: val,
        genreAvg: null,
      });
    }
  }

  return data;
}

function parseDialogue(content: string): DialogueEntry[] {
  const entries: DialogueEntry[] = [];

  // Find dialogue analysis section
  const sectionMatch = content.match(
    /## Dialogue.*?\n([\s\S]*?)(?=\n## )/i
  );
  if (!sectionMatch) return entries;

  const section = sectionMatch[1];
  const lines = section.split("\n").filter((l) => l.includes("|"));

  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const character = cells[0];
    if (
      character.toLowerCase().includes("character") ||
      character.includes("-")
    )
      continue;

    const lineCount = parseInt(cells[1], 10);
    if (isNaN(lineCount)) continue;

    const avgLength = parseFloat(cells[2]) || 0;
    const percentage = parseFloat(cells[3]) || 0;

    entries.push({ character, lineCount, avgLength, percentage });
  }

  return entries;
}

function parseOveruse(content: string): OveruseEntry[] {
  const entries: OveruseEntry[] = [];

  // Find overuse section
  const sectionMatch = content.match(
    /## Overuse.*?\n([\s\S]*?)(?=\n## |$)/i
  );
  if (!sectionMatch) return entries;

  const section = sectionMatch[1];
  const lines = section.split("\n").filter((l) => l.includes("|"));

  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const word = cells[0].replace(/[`"']/g, "");
    const count = parseInt(cells[1], 10);
    if (isNaN(count)) continue;
    if (word.toLowerCase().includes("word") || word.includes("-")) continue;

    const expected = parseInt(cells[2], 10) || 0;
    const ratio = parseFloat(cells[3]) || (expected > 0 ? count / expected : 0);

    entries.push({ word, count, expected, ratio });
  }

  return entries;
}
