import type { ParsedChapter } from "./types";

/**
 * Detect chapter boundaries in manuscript content and return parsed chapters.
 *
 * Strategy (in priority order):
 * 1. Explicit "Chapter N" patterns (multilingual: en, sr, it, es, fr, de, ru, uk)
 * 2. Prolog/Epilogue headers merged with pass 1
 * 3. H1 headings (# Title)
 * 4. H2 headings (## Title) — fallback
 * 5. ALL-CAPS standalone lines
 * 6. Entire file as Chapter 1 (ultimate fallback)
 */
export function parseManuscriptChapters(content: string): ParsedChapter[] {
  const lines = content.split("\n");

  // --- Pass 1: Try explicit "Chapter N" / multilingual patterns ---
  const explicitChapters = findExplicitChapterHeaders(lines);
  if (explicitChapters.length > 0) {
    const prologEpilog = findPrologEpilogueHeaders(lines);
    const allMarkers = mergeAndNumber([...prologEpilog, ...explicitChapters]);
    return extractChapters(lines, allMarkers);
  }

  // --- Pass 2: Try any H1 heading as chapter boundary ---
  const h1Chapters = findHeadingChapters(lines, 1);
  if (h1Chapters.length > 1) {
    return extractChapters(lines, h1Chapters);
  }

  // --- Pass 3: Try any H2 heading if no H1s or only 1 H1 ---
  const h2Chapters = findHeadingChapters(lines, 2);
  if (h2Chapters.length > 1) {
    return extractChapters(lines, h2Chapters);
  }

  // --- Pass 4: Try ALL-CAPS lines ---
  const capsChapters = findCapsChapterHeaders(lines);
  if (capsChapters.length > 1) {
    return extractChapters(lines, capsChapters);
  }

  // --- Pass 5: If we found exactly 1 H1, use it ---
  if (h1Chapters.length === 1) {
    return extractChapters(lines, h1Chapters);
  }

  // --- Fallback: entire file = chapter 1 ---
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return [
    {
      number: 1,
      title: "Chapter 1",
      content: content.trim(),
      wordCount,
    },
  ];
}

interface ChapterMarker {
  lineIndex: number;
  number: number;
  title: string;
}

/** Find explicit "Chapter N" patterns (multilingual). */
function findExplicitChapterHeaders(lines: string[]): ChapterMarker[] {
  const chapterWords =
    "Chapter|Poglavlje|Capitolo|Cap[íi]tulo|Chapitre|Kapitel|Глава|Розділ";
  const patterns = [
    new RegExp(
      `^#{1,3}\\s+(?:${chapterWords})\\s+(\\d+)\\s*[:\\-—.]?\\s*(.*)`,
      "i"
    ),
    new RegExp(
      `^(?:${chapterWords})\\s+(\\d+)\\s*[:\\-—.]?\\s*(.*)`,
      "i"
    ),
    /^#{1,3}\s+(\d+)\.\s+(.*)/,
  ];

  const results: ChapterMarker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        results.push({
          lineIndex: i,
          number: parseInt(match[1], 10),
          title: match[2]?.trim() || `Chapter ${match[1]}`,
        });
        break;
      }
    }
  }
  return results;
}

/** Find Prolog/Epilogue headings (H1/H2/H3 with no number). */
function findPrologEpilogueHeaders(lines: string[]): ChapterMarker[] {
  const prologWords =
    /^#{1,3}\s+(Prolog(?:ue)?|Epilog(?:ue)?|Predgovor|Uvod|Pogovor|Préface|Prólogo|Epílogo|Vorwort|Nachwort|Пролог|Эпилог)\s*$/i;
  const results: ChapterMarker[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(prologWords);
    if (match) {
      results.push({
        lineIndex: i,
        number: 0, // placeholder — renumbered by mergeAndNumber
        title: match[1],
      });
    }
  }
  return results;
}

/** Merge markers sorted by line index, then assign sequential chapter numbers. */
function mergeAndNumber(markers: ChapterMarker[]): ChapterMarker[] {
  markers.sort((a, b) => a.lineIndex - b.lineIndex);
  return markers.map((m, i) => ({ ...m, number: i + 1 }));
}

/** Find heading-based chapter markers (H1 or H2). */
function findHeadingChapters(
  lines: string[],
  level: 1 | 2
): ChapterMarker[] {
  const prefix = level === 1 ? /^#\s+(.+)/ : /^##\s+(.+)/;
  const results: ChapterMarker[] = [];
  let chapterNum = 0;

  const skipTitles =
    /^(table of contents|contents|acknowledgments?|copyright|dedication|about the author|sadržaj|kazalo|indice|sommaire|inhaltsverzeichnis|содержание)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(prefix);
    if (match) {
      const title = match[1].trim();
      if (!title || skipTitles.test(title)) continue;
      chapterNum++;
      results.push({ lineIndex: i, number: chapterNum, title });
    }
  }
  return results;
}

/** Find ALL-CAPS standalone lines as chapter markers. */
function findCapsChapterHeaders(lines: string[]): ChapterMarker[] {
  const results: ChapterMarker[] = [];
  let chapterNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.length >= 3 &&
      line === line.toUpperCase() &&
      /^[A-Z][A-Z\s:,'-]+$/.test(line) &&
      (i === 0 || lines[i - 1].trim() === "")
    ) {
      chapterNum++;
      const title = line
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      results.push({ lineIndex: i, number: chapterNum, title });
    }
  }
  return results;
}

/** Extract chapter content from line ranges. */
function extractChapters(
  lines: string[],
  markers: ChapterMarker[]
): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].lineIndex;
    const end =
      i + 1 < markers.length ? markers[i + 1].lineIndex : lines.length;
    const chapterContent = lines.slice(start, end).join("\n").trim();
    const wordCount = chapterContent.split(/\s+/).filter(Boolean).length;

    chapters.push({
      number: markers[i].number,
      title: markers[i].title,
      content: chapterContent,
      wordCount,
    });
  }
  return chapters;
}
