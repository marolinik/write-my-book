/**
 * Parser for market reader MARKET-READ-{market}.md reports.
 * Extracts cultural dimension scores and adaptation suggestions per market.
 */

import type {
  AdaptationSuggestion,
  CulturalDimension,
  MarketData,
  MarketReport,
} from "./types";

/**
 * Parse all market report files from their contents.
 * @param files - Map of filename to content
 */
export function parseMarketReports(
  files: Map<string, string>
): MarketData {
  const markets: MarketReport[] = [];

  files.forEach((content, filename) => {
    // Extract market code from filename: MARKET-READ-us.md -> us
    const match = filename.match(/MARKET-READ-(\w+)\.md$/i);
    if (!match) return;

    const marketId = match[1].toLowerCase();
    const report = parseSingleMarket(marketId, content);
    if (report) markets.push(report);
  });

  return { markets };
}

function parseSingleMarket(
  marketId: string,
  content: string
): MarketReport | null {
  // Extract market name from header
  const nameMatch = content.match(/^#\s+MARKET-READ:\s+(.+)/m);
  const marketName = nameMatch
    ? nameMatch[1].trim()
    : marketIdToName(marketId);

  const dimensions = parseDimensions(content);
  const suggestions = parseSuggestions(content);

  const overallScore =
    dimensions.length > 0
      ? Math.round(
          dimensions.reduce((sum, d) => sum + d.score, 0) /
            dimensions.length
        )
      : 0;

  return { marketId, marketName, overallScore, dimensions, suggestions };
}

function parseDimensions(content: string): CulturalDimension[] {
  const dimensions: CulturalDimension[] = [];

  // Known dimension names from the 8-lens system
  const dimensionNames = [
    "Theme Resonance",
    "Tone Alignment",
    "Structural Fit",
    "Character Archetype Resonance",
    "Dialogue Style",
    "Pacing Expectations",
    "Sensitivity Areas",
    "Genre Convention Alignment",
  ];

  // Try table format first
  const lines = content.split("\n").filter((l) => l.includes("|"));
  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    const name = cells[0];
    const scoreStr = cells[1] || cells[cells.length - 1];
    const score = parseFloat(scoreStr.replace(/%/g, ""));

    if (isNaN(score) || name.includes("-") || name.toLowerCase() === "dimension")
      continue;

    // Check if this looks like a dimension name
    if (
      dimensionNames.some(
        (d) => name.toLowerCase().includes(d.toLowerCase().split(" ")[0])
      ) ||
      score >= 0
    ) {
      dimensions.push({ name, score });
    }
  }

  // Fallback: look for dimension scores in text
  if (dimensions.length === 0) {
    for (const dimName of dimensionNames) {
      const regex = new RegExp(
        `${dimName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:\\s]+(\\d+)`,
        "i"
      );
      const match = content.match(regex);
      if (match) {
        dimensions.push({ name: dimName, score: parseInt(match[1], 10) });
      }
    }
  }

  return dimensions;
}

function parseSuggestions(content: string): AdaptationSuggestion[] {
  const suggestions: AdaptationSuggestion[] = [];

  // Find adaptation/suggestions section
  const sectionMatch = content.match(
    /(?:## Adaptation|### Adaptation|## Suggestion|### Suggestion).*?\n([\s\S]*?)(?=\n## |\n---\s*$|$)/i
  );
  if (!sectionMatch) return suggestions;

  const section = sectionMatch[1];
  const lines = section.split("\n");

  for (const line of lines) {
    // Match bullet points
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      suggestions.push({ text: bulletMatch[1].trim() });
    }
    // Match numbered items
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      suggestions.push({ text: numMatch[1].trim() });
    }
  }

  return suggestions;
}

function marketIdToName(id: string): string {
  const names: Record<string, string> = {
    us: "United States",
    eu: "European Union",
    uk: "United Kingdom",
    ru: "Russia",
    cn: "China",
    jp: "Japan",
    kr: "South Korea",
    rs: "Serbia",
    de: "Germany",
    fr: "France",
    br: "Brazil",
    in: "India",
  };
  return names[id] ?? id.toUpperCase();
}
