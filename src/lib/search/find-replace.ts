/**
 * Plain-text (non-regex) find & replace primitives shared by the book search
 * and replace routes. Pure and storage-agnostic so they can be unit-tested
 * without touching S3/DocumentService.
 */

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export interface FindResult {
  count: number;
  snippets: Snippet[];
}

export interface ReplaceResult {
  count: number;
  result: string;
}

/** Characters of surrounding context captured on each side of a snippet. */
export const SNIPPET_RADIUS = 40;
/** Cap on snippets returned per chapter (spec §1). */
export const MAX_SNIPPETS = 3;

/**
 * Count non-overlapping plain-text occurrences of `query` in `content` and
 * collect up to MAX_SNIPPETS context snippets. Matches advance past their own
 * length, so "aa" in "aaaa" yields 2 (not 3). The `match` field always carries
 * the ORIGINAL-cased substring so a case-insensitive search still shows the
 * real text on screen.
 */
export function findInText(
  content: string,
  query: string,
  caseSensitive: boolean
): FindResult {
  if (query.length === 0) return { count: 0, snippets: [] };

  const haystack = caseSensitive ? content : content.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const step = needle.length;

  let count = 0;
  let idx = haystack.indexOf(needle);
  const snippets: Snippet[] = [];

  while (idx !== -1) {
    count += 1;
    if (snippets.length < MAX_SNIPPETS) {
      snippets.push({
        before: content.slice(Math.max(0, idx - SNIPPET_RADIUS), idx),
        match: content.slice(idx, idx + query.length),
        after: content.slice(idx + query.length, idx + query.length + SNIPPET_RADIUS),
      });
    }
    idx = haystack.indexOf(needle, idx + step);
  }

  return { count, snippets };
}

/**
 * Replace ALL non-overlapping plain-text occurrences of `find` with `replace`.
 * Everything outside the matched substrings is preserved byte-for-byte; the
 * replacement is inserted verbatim (no case matching, no regex expansion).
 */
export function replaceInText(
  content: string,
  find: string,
  replace: string,
  caseSensitive: boolean
): ReplaceResult {
  if (find.length === 0) return { count: 0, result: content };

  const haystack = caseSensitive ? content : content.toLowerCase();
  const needle = caseSensitive ? find : find.toLowerCase();
  const step = needle.length;

  let count = 0;
  let last = 0;
  let out = "";
  let idx = haystack.indexOf(needle);

  while (idx !== -1) {
    out += content.slice(last, idx) + replace;
    count += 1;
    last = idx + step;
    idx = haystack.indexOf(needle, last);
  }
  out += content.slice(last);

  return { count, result: out };
}
