/**
 * S13: pure parser behind the chapter word-target popover input.
 *
 * Contract:
 * - digit string        → the integer to save
 * - empty / whitespace  → null   (clear the target)
 * - anything else       → undefined (invalid; caller must not submit)
 *
 * Capped at 7 digits: keeps targets sane and far below Postgres int4
 * overflow (the server schema only enforces non-negative int).
 */
const MAX_TARGET_DIGITS = 7;

export function parseWordTargetInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  if (trimmed.length > MAX_TARGET_DIGITS) return undefined;
  return Number(trimmed);
}
