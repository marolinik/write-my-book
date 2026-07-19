// src/lib/continuity/extraction-status.ts
//
// RC-4 state honesty. The continuity subsystem's extraction runs fire-and-forget
// and, before this, its outcome was invisible to the API: a scan always returned
// `{"flags":[]}`, so a writer could not tell any of these four states apart —
//
//   pending    — the chapter was never extracted (graph empty)
//   extracting — an extraction was just kicked off and hasn't landed yet
//   failed     — extraction keeps yielding nothing / erroring (D-28/D-31)
//   checked    — an extraction landed; the checks really ran on a populated graph
//
// …and an empty flag list looked identical to "continuity is protected". That
// false green is the "failure states LIE" theme judges floor-capped D7 on.
//
// This module is the PURE derivation from the Chapter node's durable facts to a
// single honest status. No Neo4j, no billing, no ambient clock (the caller
// injects `now`) — so it is exhaustively unit-testable.

/** One of the four honest extraction states a writer/UI can act on. */
export type ExtractionState = "pending" | "extracting" | "failed" | "checked";

/** Durable extraction facts read off the Chapter node (all optional/absent-safe). */
export interface ChapterExtractionFacts {
  /** Whether a Chapter node exists at all for this (book, chapterNumber). */
  hasNode: boolean;
  /** Content hash of the last SUCCESSFUL extraction; null until one lands. */
  contentHash: string | null;
  /**
   * Consecutive empty/failed extraction attempts on the CURRENT content. A
   * genuine success resets this to 0, so `> 0` reliably means "currently
   * failing" (not merely "failed once, long ago, then recovered").
   */
  emptyExtractionCount: number;
  /** When the last empty/failed attempt was recorded (ops marker). */
  lastEmptyExtractionAt: Date | null;
  /** The last successful extraction returned implausibly little for the prose size. */
  lowYield: boolean;
  /** Chapter node's updatedAt — feeds the scan throttle window. */
  updatedAt: Date | null;
}

/** Honest, UI-consumable view of a chapter's continuity-extraction state. */
export interface ExtractionStatusView {
  state: ExtractionState;
  /**
   * The current content has failed extraction `maxAttempts` times and will NOT
   * be re-attempted (or re-billed) until the writer edits the chapter. Only
   * meaningful when `state === "failed"`.
   */
  capped: boolean;
  /** Consecutive failed attempts on the current content (0 unless failing). */
  attempts: number;
  /** Last successful extraction was implausibly sparse — advisory, not a hard error. */
  lowYield: boolean;
  /** True when this scan skipped extraction because of the 90s throttle. */
  throttled: boolean;
  /**
   * Epoch-ms after which a scan may re-trigger extraction, when currently
   * throttled and NOT capped. Null when eligible now, or when capped (a capped
   * chapter recovers by a content edit, not by waiting).
   */
  retryEligibleAt: number | null;
}

export interface DeriveExtractionStatusInput {
  facts: ChapterExtractionFacts;
  /** This scan fired an extraction (shouldExtract was true and a doc was found). */
  justTriggered: boolean;
  /** This scan skipped extraction because the chapter was extracted recently. */
  throttled: boolean;
  now: Date;
  minIntervalMs: number;
  maxAttempts: number;
}

/**
 * Collapse the raw Chapter-node facts + this-scan flags into one honest state.
 *
 * Precedence:
 *  1. `justTriggered`  → "extracting" (we really did kick one off this scan).
 *  2. `emptyExtractionCount > 0` → "failed" (last attempt(s) yielded nothing and
 *     no success has cleared them). `capped` when the cap is reached.
 *  3. `contentHash` present → "checked" (a real extraction has landed).
 *  4. otherwise → "pending" (never extracted).
 */
export function deriveExtractionStatus(
  input: DeriveExtractionStatusInput
): ExtractionStatusView {
  const { facts, justTriggered, throttled, minIntervalMs, maxAttempts } = input;

  const attempts = Number.isFinite(facts.emptyExtractionCount)
    ? Math.max(0, Math.trunc(facts.emptyExtractionCount))
    : 0;

  let state: ExtractionState;
  if (justTriggered) {
    state = "extracting";
  } else if (attempts > 0) {
    state = "failed";
  } else if (facts.hasNode && facts.contentHash) {
    state = "checked";
  } else {
    state = "pending";
  }

  const capped = state === "failed" && attempts >= maxAttempts;

  // Throttle indicator: only meaningful while time-gated AND still auto-retryable.
  // A capped chapter will not auto-retry regardless of the window, so exposing a
  // retry time would itself be a lie — surface null and let `capped` explain it.
  const retryEligibleAt =
    throttled && !capped && facts.updatedAt
      ? facts.updatedAt.getTime() + minIntervalMs
      : null;

  return {
    state,
    capped,
    attempts,
    lowYield: state === "checked" && facts.lowYield === true,
    throttled,
    retryEligibleAt,
  };
}
