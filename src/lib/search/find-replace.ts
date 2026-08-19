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
 * D-189 — what counts as part of a word. Unicode-aware on purpose: the P2
 * fixture is full of `Zürich`/`Łódź`/`Kőszeg`, and an ASCII-only `\w` rule
 * would treat `ü` as a boundary and happily rewrite the middle of a name.
 * Digits and `_` are word characters too, so `ch1` never cuts `ch12`.
 */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

/**
 * True when a match at `[idx, idx + length)` of `content` is not glued to a
 * word character on either side.
 *
 * Deliberately NOT implemented by compiling the query into a `\b…\b` regex:
 * the query is writer-supplied text (`(net)`, `a.b`, `[[REPLACED]]`), so
 * building a pattern from it would need escaping and one missed escape turns a
 * rename into a silent mass edit. Boundaries are tested on the surrounding
 * characters instead, which is escape-safe by construction.
 */
function isWholeWordMatch(
  content: string,
  idx: number,
  length: number
): boolean {
  return (
    !isWordChar(content[idx - 1]) && !isWordChar(content[idx + length])
  );
}

/**
 * D-189 — whether whole-word matching can mean anything for this query. A
 * query that does not begin AND end with a word character (`—`, `...`, or a
 * space-padded ` the `) can never satisfy the boundary rule, so offering the
 * option would return a silent zero. UI surfaces use this to disable the
 * toggle rather than let the writer believe they searched.
 */
export function isWordLikeQuery(query: string): boolean {
  if (query.length === 0) return false;
  return isWordChar(query[0]) && isWordChar(query[query.length - 1]);
}

/**
 * Count non-overlapping plain-text occurrences of `query` in `content` and
 * collect up to MAX_SNIPPETS context snippets. Matches advance past their own
 * length, so "aa" in "aaaa" yields 2 (not 3). The `match` field always carries
 * the ORIGINAL-cased substring so a case-insensitive search still shows the
 * real text on screen.
 *
 * `wholeWord` (D-189) keeps only matches that stand alone as words — the
 * option a book-wide character rename needs. Defaults to false so existing
 * callers keep substring semantics.
 */
export function findInText(
  content: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean = false
): FindResult {
  if (query.length === 0) return { count: 0, snippets: [] };

  const haystack = caseSensitive ? content : content.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const step = needle.length;

  let count = 0;
  let idx = haystack.indexOf(needle);
  const snippets: Snippet[] = [];

  while (idx !== -1) {
    if (!wholeWord || isWholeWordMatch(content, idx, query.length)) {
      count += 1;
      if (snippets.length < MAX_SNIPPETS) {
        snippets.push({
          before: content.slice(Math.max(0, idx - SNIPPET_RADIUS), idx),
          match: content.slice(idx, idx + query.length),
          after: content.slice(idx + query.length, idx + query.length + SNIPPET_RADIUS),
        });
      }
    }
    idx = haystack.indexOf(needle, idx + step);
  }

  return { count, snippets };
}

/**
 * Replace ALL non-overlapping plain-text occurrences. The replacement is
 * inserted byte-for-byte; nothing in `replace` is interpreted (no `$1`, no
 * regex expansion).
 *
 * `wholeWord` (D-189) skips occurrences that sit inside a longer word, which
 * is what stops a `Sam` → `Max` rename from producing `Maxe`/`Maxple`/
 * `Maxovar` across a finished manuscript. Defaults to false so existing
 * callers keep substring semantics.
 */
export function replaceInText(
  content: string,
  find: string,
  replace: string,
  caseSensitive: boolean,
  wholeWord: boolean = false
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
    if (!wholeWord || isWholeWordMatch(content, idx, find.length)) {
      out += content.slice(last, idx) + replace;
      count += 1;
      last = idx + step;
    }
    idx = haystack.indexOf(needle, idx + step);
  }
  out += content.slice(last);

  return { count, result: out };
}
