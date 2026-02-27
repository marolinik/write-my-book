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

/**
 * Extract a numeric 0-10 score from beta-read persona scores.
 * Returns the average of all persona scores, or null if no personas found.
 */
export function extractNumericScore(personas: Array<{ score: number }>): number | null {
  if (personas.length === 0) return null;
  const avg = personas.reduce((sum, p) => sum + p.score, 0) / personas.length;
  return parseFloat(avg.toFixed(1));
}

export function parseBetaReaderReport(content: string): BetaReaderData {
  const gate = parseGateResult(content);
  const personas = parsePersonas(content);
  const emotions = parseEmotionTable(content);
  const engagement = parseEngagementTable(content);
  const roundTable = parseRoundTable(content);

  return { gate, personas, emotions, engagement, roundTable };
}

function parseGateResult(content: string): GateResult {
  // Try multiple regex patterns to find gate result, handling both English and Serbian output:
  //   English: "GATE RESULT: PASSED" / "GATE ASSESSMENT: NEEDS_REVISION"
  //   Serbian: "Gate ocena: NEEDS_REVISION" / "PREPORUKA: **...** (NEEDS_REVISION)"
  //   Prompt says: PASS / NEEDS_REVISION / MAJOR_REVISION
  //   Parser canonical: PASSED / NEAR_MISS / FAILED
  const gateValuePattern = "(PASSED|PASS|FAILED|FAIL|NEAR[\\s_]*MISS|NEEDS[\\s_]*REVISION|MAJOR[\\s_]*REVISION)";
  const gatePatterns = [
    // English headings: "GATE RESULT:" or "GATE ASSESSMENT:"
    new RegExp(`GATE\\s+(?:RESULT|ASSESSMENT)[:\\s]+\\*{0,2}\\s*${gateValuePattern}`, "i"),
    // Serbian heading: "Gate ocena:"
    new RegExp(`Gate\\s+ocena[:\\s]+\\*{0,2}\\s*${gateValuePattern}`, "i"),
    // Parenthesized value after recommendation: "PREPORUKA: **...** (NEEDS_REVISION)"
    new RegExp(`(?:PREPORUKA|RECOMMENDATION)[:\\s]+\\*{0,2}[^(]*\\(${gateValuePattern}\\)`, "i"),
    // Standalone bold gate result: **NEEDS_REVISION** or **PASS**
    new RegExp(`\\*\\*${gateValuePattern}\\*\\*`, "i"),
  ];

  let result: GateResult["result"] = "FAILED";
  for (const pattern of gatePatterns) {
    const match = content.match(pattern);
    if (match) {
      const raw = match[1].replace(/[\s_]+/g, "_").toUpperCase();
      if (raw === "PASSED" || raw === "PASS") {
        result = "PASSED";
      } else if (raw === "NEAR_MISS" || raw === "NEEDS_REVISION") {
        result = "NEAR_MISS";
      } else {
        // FAILED, FAIL, MAJOR_REVISION all map to FAILED
        result = "FAILED";
      }
      break;
    }
  }

  // Flexible consensus matching: "Consensus: 3/5 passed (60%)" or "3/5 (60%)" etc.
  const consensusMatch = content.match(
    /(?:Consensus|Konsenzus)[:\s]*(\d+)\s*\/\s*(\d+)\s*(?:passed\s*)?\(?(\d+)%\)?/i
  );
  let passVotes = consensusMatch ? parseInt(consensusMatch[1], 10) : 0;
  let totalVotes = consensusMatch ? parseInt(consensusMatch[2], 10) : 0;
  let consensus = consensusMatch ? parseInt(consensusMatch[3], 10) : 0;

  // Fallback: count individual persona PASS/FAIL votes from the report
  if (totalVotes === 0) {
    const passCount = (content.match(/--\s*PASS\b/gi) || []).length;
    const failCount = (content.match(/--\s*FAIL\b/gi) || []).length;
    if (passCount + failCount > 0) {
      passVotes = passCount;
      totalVotes = passCount + failCount;
      consensus = Math.round((passCount / totalVotes) * 100);
    }
  }

  // Flexible score matching: "Average Score: 7.2/10 (Good)" or "Prosečna ocena: 7.2/10"
  const scoreMatch = content.match(
    /(?:Average\s+Score|Prose[čc]na\s+[Oo]cena)[:\s]*(\d+\.?\d*)\s*\/\s*10(?:\s*\(([^)]+)\))?/i
  );
  const scoreBand = scoreMatch ? (scoreMatch[2]?.trim() ?? "Unknown") : "Unknown";

  // Convergence from diagnostic matrix section (English or Serbian)
  const convergenceMatch = content.match(/(?:Convergence|Konvergencija|Saglasnost).*?(\d+)%/i);
  const convergence = convergenceMatch
    ? parseInt(convergenceMatch[1], 10)
    : 0;

  return { result, consensus, convergence, scoreBand, totalVotes, passVotes };
}

function parsePersonas(content: string): BetaPersona[] {
  const personas: BetaPersona[] = [];

  // Match individual persona sections with flexible separators and multilingual labels:
  // English: ### Name (Archetype) -- Score: 7.5/10 -- PASS
  // Serbian: ### Ime (Arhetip) — Ocena: 7.5/10 — PROLAZ/PADA
  // Also handles: |, –, —, --, :, and "Ocena"/"Score"
  const personaRegex =
    /###\s+(.+?)\s+\(([^)]+)\)\s*(?:--|—|–|\|)\s*(?:Score|Ocena)[:\s]*(\d+\.?\d*)\s*\/\s*10\s*(?:--|—|–|\|)\s*(PASS(?:ED)?|FAIL(?:ED)?|PROLAZ|PADA)/gi;

  let match;
  while ((match = personaRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const archetype = match[2].trim();
    const score = parseFloat(match[3]);
    const voteStr = match[4].toUpperCase();
    const vote = voteStr === "PASS" || voteStr === "PASSED" || voteStr === "PROLAZ";

    // Extract feedback excerpt (first paragraph after **Feedback:** or **Povratna informacija:**)
    const afterMatch = content.slice(match.index + match[0].length);
    const feedbackMatch = afterMatch.match(
      /\*\*(?:Feedback|Povratna informacija|Komentar):\*\*\s*\n>\s*([^\n]+)/
    );
    const excerpt = feedbackMatch
      ? feedbackMatch[1].replace(/^>\s*/gm, "").slice(0, 200).trim()
      : "";

    personas.push({ name, archetype, score, vote, excerpt });
  }

  // Fallback 1: Serbian-format persona sections with dimension scores
  // ### PERSONA N: NAME (Archetype)
  // - **Ukupno uživanje:** 7.5/10
  // **Komentar:** "..."
  if (personas.length === 0) {
    const serbianPersonaRegex =
      /###\s+(?:PERSONA\s+\d+[:\s]*)?(.+?)\s+\(([^)]+)\)/gi;
    let sMatch;
    while ((sMatch = serbianPersonaRegex.exec(content)) !== null) {
      const name = sMatch[1].trim();
      const archetype = sMatch[2].trim();
      const afterSection = content.slice(sMatch.index + sMatch[0].length);
      // Find the overall enjoyment score (in English or Serbian)
      const scoreMatch = afterSection.match(
        /\*\*(?:Ukupno uživanje|Overall enjoyment|Overall)[:\s]*\*\*\s*(\d+\.?\d*)\s*\/\s*10/i
      );
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
      const vote = score >= 7;
      // Find feedback excerpt
      const excerptMatch = afterSection.match(
        /\*\*(?:Komentar|Feedback|Povratna informacija):\*\*\s*"?([^"\n]{10,200})/i
      );
      const excerpt = excerptMatch ? excerptMatch[1].trim() : "";
      if (score > 0) {
        personas.push({ name, archetype, score, vote, excerpt });
      }
    }
  }

  // Fallback 2: parse from Scores line in executive summary
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
