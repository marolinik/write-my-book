/**
 * Dev editor v2, phase C — a chapter's opening or ending, cut out so a hook
 * move can rewrite it and nothing else.
 *
 * The edge is the first or last scene when the chapter has scene breaks;
 * otherwise the first or last few paragraphs. `joinEdge` puts the chapter back
 * together: with the original segment it is byte-identical, so everything
 * outside the edge provably survives the rewrite.
 */

const SCENE_BREAK = /^\s*(?:\*\s*\*\s*\*|-{3,}|_{3,}|◆|●|⁂|#)\s*$/;
const HEADING = /^\s*#{1,6}\s/;
/** A single-scene chapter's edge: this share of its paragraphs, two to five. */
const EDGE_SHARE = 0.25;
const MIN_EDGE_PARAGRAPHS = 2;
const MAX_EDGE_PARAGRAPHS = 5;
/** A scene shorter than this is a dateline or an epigraph, not an opening. */
const MIN_EDGE_WORDS = 15;

export type EdgeScope = "opening" | "ending";

export interface ChapterEdge {
  before: string;
  segment: string;
  after: string;
  /** The chapter's line ending, so a rewrite goes back in the same one. */
  eol: "\r\n" | "\n";
}

/** Character offsets of each paragraph's text in `content` (blank-line separated). */
function paragraphSpans(content: string): Array<{ start: number; end: number; text: string }> {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  const re = /[^\n](?:[^\n]|\n(?!\s*\n))*/g;
  for (let m = re.exec(content); m; m = re.exec(content)) {
    if (m[0].trim().length > 0) spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return spans;
}

function isBreak(text: string): boolean {
  return text.split("\n").every((l) => SCENE_BREAK.test(l));
}

function isHeading(text: string): boolean {
  return text.split("\n").every((l) => HEADING.test(l) || l.trim() === "");
}

/** A paragraph whose first lines are a heading starts after them. */
function withoutLeadingHeading(span: { start: number; end: number; text: string }) {
  const lines = span.text.split("\n");
  let skip = 0;
  let offset = 0;
  while (skip < lines.length - 1 && HEADING.test(lines[skip])) {
    offset += lines[skip].length + 1;
    skip++;
  }
  return skip === 0 ? span : { start: span.start + offset, end: span.end, text: span.text.slice(offset) };
}

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function splitEdge(content: string, scope: EdgeScope): ChapterEdge {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const spans = paragraphSpans(content)
    .filter((s) => !isHeading(s.text))
    .map(withoutLeadingHeading);
  if (spans.length === 0) return { before: content, segment: "", after: "", eol };

  // Group prose paragraphs into scenes at break lines.
  const sceneGroups: Array<typeof spans> = [[]];
  for (const s of spans) {
    if (isBreak(s.text)) sceneGroups.push([]);
    else sceneGroups[sceneGroups.length - 1].push(s);
  }
  const nonEmpty = sceneGroups.filter((g) => g.length > 0);

  let chosen: typeof spans;
  if (nonEmpty.length > 1) {
    // Skip a dateline or epigraph standing alone before the first break (or
    // after the last), and cap a long scene at its first or last paragraphs.
    const substantial = nonEmpty.filter((g) => wordCount(g.map((s) => s.text).join(" ")) >= MIN_EDGE_WORDS);
    const pool = substantial.length > 0 ? substantial : nonEmpty;
    const group = scope === "opening" ? pool[0] : pool[pool.length - 1];
    const n = Math.min(MAX_EDGE_PARAGRAPHS, group.length);
    chosen = scope === "opening" ? group.slice(0, n) : group.slice(group.length - n);
  } else {
    const prose = nonEmpty[0] ?? [];
    const n = Math.min(
      MAX_EDGE_PARAGRAPHS,
      Math.max(MIN_EDGE_PARAGRAPHS, Math.round(prose.length * EDGE_SHARE)),
      Math.max(1, prose.length - 1)
    );
    chosen = scope === "opening" ? prose.slice(0, n) : prose.slice(prose.length - n);
  }

  const start = chosen[0].start;
  const end = chosen[chosen.length - 1].end;
  return {
    before: content.slice(0, start),
    segment: content.slice(start, end),
    after: content.slice(end),
    eol,
  };
}

export function joinEdge(edge: ChapterEdge, segment: string): string {
  const inPlace = segment.replace(/\r?\n/g, edge.eol);
  return `${edge.before}${inPlace}${edge.after}`;
}
