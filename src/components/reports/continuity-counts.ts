export interface DomainStats {
  total: number;
  critical: number;
  major: number;
  minor: number;
  suggestion: number;
}

/**
 * The badges for one domain card, guaranteed to add up to its total.
 *
 * The severity buckets only recognise four words, and EditFinding's vocabulary
 * is critical | important | suggestion — so counting the buckets directly hid
 * every "important" finding and made the card contradict the header (S3-11).
 * `rest` is therefore derived, not counted: everything that is not critical or
 * major, whatever it called itself.
 */
export function domainBadgeCounts(stats: DomainStats) {
  const critical = Math.min(stats.critical, stats.total);
  const major = Math.min(stats.major, Math.max(0, stats.total - critical));
  return {
    critical,
    major,
    rest: Math.max(0, stats.total - critical - major),
  };
}
