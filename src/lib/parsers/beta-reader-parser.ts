/**
 * Parser for beta reader report markdown files.
 * Extracts structured data from BETA-READ.md reports.
 */

import type {
  BetaPersona,
  BetaReaderData,
  EmotionCell,
  EngagementDataPoint,
  GateResult,
  RoundTableEntry,
} from "./types";

export function parseBetaReaderReport(content: string): BetaReaderData {
  const gate = parseGateResult(content);
  const personas = parsePersonas(content);
  const emotions = parseEmotionTable(content);
  const engagement = parseEngagementTable(content);
  const roundTable = parseRoundTable(content);

  return { gate, personas, emotions, engagement, roundTable };
}

function parseGateResult(content: string): GateResult {
  const resultMatch = content.match(
    /GATE\s+RESULT:\s*(PASSED|FAILED|NEAR\s*MISS)/i
  );
  const result = resultMatch
    ? (resultMatch[1].replace(/\s+/g, "_").toUpperCase() as GateResult["result"])
    : "FAILED";

  const consensusMatch = content.match(
    /Consensus:\s*(\d+)\s*\/\s*(\d+)\s*passed\s*\((\d+)%\)/i
  );
  const passVotes = consensusMatch ? parseInt(consensusMatch[1], 10) : 0;
  const totalVotes = consensusMatch ? parseInt(consensusMatch[2], 10) : 0;
  const consensus = consensusMatch ? parseInt(consensusMatch[3], 10) : 0;

  const scoreMatch = content.match(
    /Average\s+Score:\s*(\d+\.?\d*)\s*\/\s*10\s*\(([^)]+)\)/i
  );
  const scoreBand = scoreMatch ? scoreMatch[2].trim() : "Unknown";

  // Convergence from diagnostic matrix section
  const convergenceMatch = content.match(/Convergence.*?(\d+)%/i);
  const convergence = convergenceMatch
    ? parseInt(convergenceMatch[1], 10)
    : 0;

  return { result, consensus, convergence, scoreBand, totalVotes, passVotes };
}

function parsePersonas(content: string): BetaPersona[] {
  const personas: BetaPersona[] = [];

  // Match individual persona sections: ### Name (Archetype) -- Score: X/10 -- PASS/FAIL
  const personaRegex =
    /###\s+(.+?)\s+\(([^)]+)\)\s*--\s*Score:\s*(\d+\.?\d*)\s*\/\s*10\s*--\s*(PASS|FAIL)/gi;

  let match;
  while ((match = personaRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const archetype = match[2].trim();
    const score = parseFloat(match[3]);
    const vote = match[4].toUpperCase() === "PASS";

    // Extract feedback excerpt (first paragraph after **Feedback:**)
    const afterMatch = content.slice(match.index + match[0].length);
    const feedbackMatch = afterMatch.match(
      /\*\*Feedback:\*\*\s*\n>\s*([^\n]+)/
    );
    const excerpt = feedbackMatch
      ? feedbackMatch[1].replace(/^>\s*/gm, "").slice(0, 200).trim()
      : "";

    personas.push({ name, archetype, score, vote, excerpt });
  }

  // Fallback: parse from Scores line in executive summary
  if (personas.length === 0) {
    const scoresLine = content.match(/\*\*Scores:\*\*\s*(.+)/i);
    if (scoresLine) {
      const pairs = scoresLine[1].split("|").map((s) => s.trim());
      for (const pair of pairs) {
        const pairMatch = pair.match(/(.+?):\s*(\d+\.?\d*)/);
        if (pairMatch) {
          personas.push({
            name: pairMatch[1].trim(),
            archetype: "Reader",
            score: parseFloat(pairMatch[2]),
            vote: parseFloat(pairMatch[2]) >= 6,
            excerpt: "",
          });
        }
      }
    }
  }

  return personas;
}

function parseEmotionTable(content: string): EmotionCell[] {
  const emotions: EmotionCell[] = [];

  // Find the Emotional Arc table
  const tableMatch = content.match(
    /### Emotional Arc.*?\n([\s\S]*?)(?=\n###|\n---|\n## )/i
  );
  if (!tableMatch) return emotions;

  const tableContent = tableMatch[1];
  const lines = tableContent.split("\n").filter((l) => l.includes("|"));

  if (lines.length < 3) return emotions;

  // Parse header to get beat names
  const headerCells = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  const beats = headerCells.slice(1); // Skip "Persona" column

  // Parse data rows (skip header and separator)
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells[0].startsWith("**")) continue; // Skip "Intended" row

    const persona = cells[0];
    for (let j = 1; j < cells.length && j - 1 < beats.length; j++) {
      const cell = cells[j];
      // Parse "Emotion/Intensity" format
      const parts = cell.split("/");
      if (parts.length >= 2) {
        emotions.push({
          persona,
          beat: beats[j - 1],
          emotion: parts[0].trim(),
          intensity: parseInt(parts[1], 10) || 5,
        });
      }
    }
  }

  return emotions;
}

function parseEngagementTable(content: string): EngagementDataPoint[] {
  const data: EngagementDataPoint[] = [];

  // Find the Engagement Heatmap table
  const tableMatch = content.match(
    /### Engagement Heatmap.*?\n([\s\S]*?)(?=\n###|\n---|\n## |Key:)/i
  );
  if (!tableMatch) return data;

  const tableContent = tableMatch[1];
  const lines = tableContent.split("\n").filter((l) => l.includes("|"));

  if (lines.length < 3) return data;

  // Parse header for beat names
  const headerCells = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  const beats = headerCells.slice(1);

  // Parse marker rows
  const markerMap: Record<string, number[]> = {};
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    const marker = cells[0].toLowerCase().replace(/\s+/g, "");
    const values = cells.slice(1).map((c) => symbolToScore(c));
    markerMap[marker] = values;
  }

  // Build data points per beat
  for (let i = 0; i < beats.length; i++) {
    data.push({
      beat: beats[i],
      investment: markerMap["investment"]?.[i] ?? 0,
      drift: markerMap["drift"]?.[i] ?? 0,
      confusion: markerMap["confusion"]?.[i] ?? 0,
      putDownRisk: markerMap["put-downrisk"]?.[i] ?? markerMap["putdownrisk"]?.[i] ?? 0,
      anticipation: markerMap["anticipation"]?.[i] ?? 0,
    });
  }

  return data;
}

function symbolToScore(symbol: string): number {
  const s = symbol.trim();
  if (s === "+++") return 9;
  if (s === "++") return 6;
  if (s === "+") return 3;
  if (s === ".") return 0;
  // Try numeric
  const num = parseFloat(s);
  if (!isNaN(num)) return num;
  return 0;
}

function parseRoundTable(content: string): RoundTableEntry[] {
  const entries: RoundTableEntry[] = [];

  const sectionMatch = content.match(
    /## Round-Table Discussion\s*\n([\s\S]*?)(?=\n## |\n---\s*\n\*)/i
  );
  if (!sectionMatch) return entries;

  const section = sectionMatch[1];

  // Match **PERSONA_NAME (ARCHETYPE):** text on each line
  const lines = section.split("\n");
  for (const line of lines) {
    const lineMatch = line.match(
      /\*\*([A-Z][^*]+?)\s*\(([^)]+)\)\*?\*?:\*?\*?\s*(.+)/
    );
    if (lineMatch) {
      entries.push({
        name: lineMatch[1].trim(),
        archetype: lineMatch[2].trim(),
        text: lineMatch[3].trim(),
      });
    }
  }

  return entries;
}
