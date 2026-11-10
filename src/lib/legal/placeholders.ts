/** A bracketed value the owner or counsel still has to supply in Privacy or Terms. */
const PLACEHOLDER = /\[[^\]\n]*to be (?:completed|confirmed)[^\]\n]*\]/gi;

export function findLegalPlaceholders(source: string): string[] {
  return source.match(PLACEHOLDER) ?? [];
}
