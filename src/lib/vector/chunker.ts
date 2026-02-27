/**
 * Scene-aware chunking for content.
 * Splits markdown by scene breaks, then into ~400-token windows with overlap.
 * Strips markdown formatting before chunking for cleaner embeddings.
 */

import crypto from "crypto";

export interface ChunkOptions {
  maxTokens?: number; // default 400
  overlapTokens?: number; // default 50
}

export interface TextChunk {
  text: string;
  sceneIndex: number;
  chunkIndex: number;
  wordCount: number;
  charactersMentioned: string[];
  contentHash: string;
}

/** Patterns that indicate a scene break in manuscript markdown */
const SCENE_BREAK_PATTERN =
  /(?:^|\n)(?:\* \* \*|---|\*\*\*|#{1,6} |\n{3,})/;

/** Approximate tokens as words * 1.3 */
function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

/**
 * Strip markdown formatting from text for cleaner embeddings.
 * Removes: code blocks, inline code, heading markers (keeps text),
 * bold/italic markers, links (keeps text), images, blockquote markers,
 * horizontal rules, HTML tags, and collapses whitespace.
 */
export function stripMarkdown(text: string): string {
  let result = text;

  // Remove fenced code blocks (```...```)
  result = result.replace(/```[\s\S]*?```/g, "");

  // Remove inline code (`...`)
  result = result.replace(/`([^`]+)`/g, "$1");

  // Remove images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");

  // Convert links to just text: [text](url)
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Remove heading markers (keep text): ## Heading -> Heading
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Remove bold/italic markers: **text** -> text, *text* -> text, __text__ -> text, _text_ -> text
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/\*([^*]+)\*/g, "$1");
  result = result.replace(/__([^_]+)__/g, "$1");
  result = result.replace(/_([^_]+)_/g, "$1");

  // Remove blockquote markers: > text -> text
  result = result.replace(/^>\s?/gm, "");

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, "");

  // Remove HTML tags
  result = result.replace(/<[^>]+>/g, "");

  // Collapse multiple newlines to double newline
  result = result.replace(/\n{3,}/g, "\n\n");

  // Collapse multiple spaces to single space
  result = result.replace(/ {2,}/g, " ");

  // Trim
  result = result.trim();

  return result;
}

/**
 * Extract character names mentioned in a text.
 * Looks for capitalized proper nouns (2+ letters) that appear at least twice.
 * Filters out common sentence-starters and known non-name words.
 */
function extractCharacters(text: string): string[] {
  const COMMON_WORDS = new Set([
    "The",
    "This",
    "That",
    "These",
    "Those",
    "There",
    "They",
    "Then",
    "Than",
    "Their",
    "Them",
    "When",
    "Where",
    "What",
    "Which",
    "While",
    "With",
    "Would",
    "Will",
    "Was",
    "Were",
    "Have",
    "Has",
    "Had",
    "How",
    "Here",
    "His",
    "Her",
    "He",
    "She",
    "It",
    "Its",
    "But",
    "And",
    "For",
    "Not",
    "Are",
    "Our",
    "Out",
    "All",
    "Can",
    "Did",
    "Get",
    "Got",
    "Just",
    "Let",
    "May",
    "Now",
    "One",
    "Two",
    "New",
    "Old",
    "See",
    "Way",
    "Who",
    "Boy",
    "Day",
    "Eye",
    "Far",
    "Few",
    "Big",
    "Come",
    "Each",
    "Even",
    "From",
    "Give",
    "Good",
    "Great",
    "Hand",
    "High",
    "Home",
    "Keep",
    "Last",
    "Long",
    "Look",
    "Make",
    "Most",
    "Much",
    "Must",
    "Name",
    "Only",
    "Over",
    "Part",
    "Said",
    "Same",
    "Some",
    "Such",
    "Take",
    "Tell",
    "Very",
    "Want",
    "Well",
    "Went",
    "Year",
    "Also",
    "Back",
    "Been",
    "Call",
    "Down",
    "Find",
    "First",
    "Into",
    "Like",
    "Made",
    "Many",
    "More",
    "Never",
    "Next",
    "Once",
    "Other",
    "Still",
    "After",
    "Again",
    "Before",
    "Being",
    "Between",
    "Could",
    "Every",
    "Found",
    "Know",
    "Might",
    "Nothing",
    "Perhaps",
    "Should",
    "Since",
    "Something",
    "Think",
    "Though",
    "Through",
    "Under",
    "Until",
    "Without",
    "Yes",
    "No",
    "Chapter",
    "Part",
    "Section",
    "Note",
    "However",
    "Instead",
    "Already",
    "Another",
    "Because",
    "Enough",
    "Rather",
    "Several",
    "Suddenly",
    "Finally",
    "Meanwhile",
  ]);

  // Match capitalized words (2+ letters) that are NOT at line start
  // Also match them at line start but only count if they appear mid-sentence too
  const namePattern = /\b([A-Z][a-z]{1,})\b/g;
  const counts = new Map<string, number>();

  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const word = match[1];
    if (!COMMON_WORDS.has(word)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  // Only include names that appear at least twice
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([name]) => name)
    .sort();
}

/**
 * Split text into scenes based on scene break markers.
 */
function splitIntoScenes(content: string): string[] {
  // Split on scene breaks: "* * *", "---", "***", headings, or 3+ blank lines
  const scenes = content
    .split(/(?:\n\s*\* \* \*\s*\n|\n\s*---\s*\n|\n\s*\*\*\*\s*\n|\n{3,}|\n(?=#{1,6}\s))/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return scenes.length > 0 ? scenes : [content];
}

/**
 * Split a scene into token-bounded windows with overlap.
 */
function splitIntoWindows(
  text: string,
  maxTokens: number,
  overlapTokens: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const maxWords = Math.floor(maxTokens / 1.3);
  const overlapWords = Math.floor(overlapTokens / 1.3);

  // If the text fits in one window, return it as-is
  if (estimateTokens(text) <= maxTokens) {
    return [text];
  }

  const windows: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const window = words.slice(start, end).join(" ");
    windows.push(window);

    if (end >= words.length) break;

    // Move forward by (maxWords - overlapWords) to create overlap
    start = start + maxWords - overlapWords;
  }

  return windows;
}

/**
 * Chunk content into scene-aware segments for vector indexing.
 *
 * 1. Strip markdown formatting for cleaner embeddings
 * 2. Split by scene breaks (look for `* * *`, `---`, `***`, headings, or 3+ blank lines)
 * 3. Within each scene, split into ~400-token windows with 50-token overlap
 * 4. Extract character names mentioned in each chunk
 * 5. Generate content hash per chunk for dedup
 */
export function chunkChapterContent(
  content: string,
  bookId: string,
  chapterNumber: number,
  options?: ChunkOptions
): TextChunk[] {
  const maxTokens = options?.maxTokens ?? 400;
  const overlapTokens = options?.overlapTokens ?? 50;

  // Strip markdown before chunking for cleaner embeddings
  const strippedContent = stripMarkdown(content);

  const scenes = splitIntoScenes(strippedContent);
  const chunks: TextChunk[] = [];
  let globalChunkIndex = 0;

  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const sceneText = scenes[sceneIndex];
    const windows = splitIntoWindows(sceneText, maxTokens, overlapTokens);

    for (const windowText of windows) {
      const wordCount = windowText.split(/\s+/).filter(Boolean).length;
      const contentHash = crypto
        .createHash("sha256")
        .update(`${bookId}:${chapterNumber}:${windowText}`)
        .digest("hex")
        .slice(0, 16);

      chunks.push({
        text: windowText,
        sceneIndex,
        chunkIndex: globalChunkIndex,
        wordCount,
        charactersMentioned: extractCharacters(windowText),
        contentHash,
      });

      globalChunkIndex++;
    }
  }

  return chunks;
}
