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

/**
 * WHY a chapter is in the "failed" state — the two failure classes recover
 * differently, so the UI must tell them apart (D-73 E4):
 *
 *  - "empty"  — extraction ran but yielded nothing usable on substantive prose
 *               (D-31). This is CONTENT the model can't parse; recovery is the
 *               writer EDITING the chapter (a new content hash resets the cap).
 *  - "failed" — a hard LLM/parse THROW or a post-spend infra flake (D-73 E6):
 *               the provider was down / a key rotated / Neo4j write blipped.
 *               Nothing is wrong with the prose; recovery is a timed backoff
 *               (self-heals) or a re-scan after the provider returns — NEVER a
 *               forced prose edit.
 *
 * `null` when the chapter is not failing.
 */
export type ExtractionFailureKind = "empty" | "failed";

/** Durable extraction facts read off the Chapter node (all optional/absent-safe). */
export interface ChapterExtractionFacts {
  /** Whether a Chapter node exists at all for this (book, chapterNumber). */
  hasNode: boolean;
  /** Content hash of the last SUCCESSFUL extraction; null until one lands. */
  contentHash: string | null;
  /**
   * Consecutive suspicious-EMPTY attempts on the CURRENT content (D-31). A
   * genuine success resets this to 0, so `> 0` reliably means "currently failing
   * on content" (not merely "failed once, long ago, then recovered").
   */
  emptyExtractionCount: number;
  /** When the last suspicious-empty attempt was recorded (ops marker). */
  lastEmptyExtractionAt: Date | null;
  /**
   * Consecutive hard-FAILURE attempts (throws / post-spend infra flakes, D-73
   * E4/E6). NOT content-scoped — a provider outage is independent of the prose —
   * so it is bounded by a time-decaying backoff, not a content edit. Reset to 0
   * on a genuine success.
   */
  failedExtractionCount: number;
  /** When the last hard failure was recorded — anchors the backoff window. */
  lastFailedExtractionAt: Date | null;
  /** Last hard-failure reason (e.g. "provider 503") for the UI; null if none. */
  lastFailureReason: string | null;
  /** The last successful extraction returned implausibly little for the prose size. */
  lowYield: boolean;
  /** Chapter node's updatedAt — feeds the scan throttle window. */
  updatedAt: Date | null;
}

/** Honest, UI-consumable view of a chapter's continuity-extraction state. */
export interface ExtractionStatusView {
  state: ExtractionState;
  /**
   * WHY it is failing (D-73 E4). "empty" → edit the prose; "failed" → provider
   * was down, wait/retry. Null unless `state === "failed"`.
   */
  kind: ExtractionFailureKind | null;
  /**
   * The current failure class has hit its cap and will NOT be re-attempted (or
   * re-billed) right now. For "empty" that means "until the writer edits"; for
   * "failed" that means "until the backoff window elapses" (see retryEligibleAt).
   * Only meaningful when `state === "failed"`.
   */
  capped: boolean;
  /** Consecutive failed attempts of the CURRENT kind (0 unless failing). */
  attempts: number;
  /** Last hard-failure reason, surfaced only when `kind === "failed"`. */
  reason: string | null;
  /** Last successful extraction was implausibly sparse — advisory, not a hard error. */
  lowYield: boolean;
  /** True when this scan skipped extraction because of the 90s throttle. */
  throttled: boolean;
  /**
   * Epoch-ms after which a scan may re-trigger extraction. Set when either
   *  (a) a "failed"-kind cap is in its backoff window (retry after the window), or
   *  (b) the 90s throttle is active and the chapter is NOT capped.
   * Null when eligible now, or when an "empty" cap requires a content edit (no
   * amount of waiting helps, so a retry time would be a lie).
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
  /** Content-empty cap (edit-gated). */
  maxAttempts: number;
  /** Hard-failure cap (backoff-gated). */
  maxFailedAttempts: number;
  /** How long a failed-kind cap backs off before an auto-retry is eligible. */
  failedBackoffMs: number;
}

const clampCount = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;

/**
 * Collapse the raw Chapter-node facts + this-scan flags into one honest state.
 *
 * Precedence:
 *  1. `justTriggered` → "extracting" (we really did kick one off this scan).
 *  2. A failure marker is set → "failed". When BOTH an empty and a hard-failure
 *     marker are present (e.g. an empty content that later hit a provider
 *     outage), the MORE RECENT marker wins — that is the state the writer should
 *     act on. `kind` says which, `capped`/`retryEligibleAt` how to recover.
 *  3. `contentHash` present → "checked" (a real extraction has landed).
 *  4. otherwise → "pending" (never extracted).
 */
export function deriveExtractionStatus(
  input: DeriveExtractionStatusInput
): ExtractionStatusView {
  const {
    facts,
    justTriggered,
    throttled,
    minIntervalMs,
    maxAttempts,
    maxFailedAttempts,
    failedBackoffMs,
  } = input;

  const emptyAttempts = clampCount(facts.emptyExtractionCount);
  const failedAttempts = clampCount(facts.failedExtractionCount);

  // Which failure is CURRENT? If both markers are set, the more recent one is
  // what the writer should act on; a lone marker wins by default.
  let kind: ExtractionFailureKind | null = null;
  if (emptyAttempts > 0 && failedAttempts > 0) {
    const emptyAt = facts.lastEmptyExtractionAt?.getTime() ?? 0;
    const failedAt = facts.lastFailedExtractionAt?.getTime() ?? 0;
    kind = failedAt >= emptyAt ? "failed" : "empty";
  } else if (failedAttempts > 0) {
    kind = "failed";
  } else if (emptyAttempts > 0) {
    kind = "empty";
  }

  let state: ExtractionState;
  if (justTriggered) {
    state = "extracting";
  } else if (kind !== null) {
    state = "failed";
  } else if (facts.hasNode && facts.contentHash) {
    state = "checked";
  } else {
    state = "pending";
  }

  // Only surface a failure kind while actually in the failed state (a just-
  // triggered re-extraction is "extracting", not "failed", even with stale markers).
  const failing = state === "failed" ? kind : null;
  const attempts =
    failing === "failed" ? failedAttempts : failing === "empty" ? emptyAttempts : 0;

  let capped = false;
  let retryEligibleAt: number | null = null;

  if (failing === "empty") {
    // Content-empty: edit-gated. Capped once the ceiling is hit; waiting never
    // helps, so retryEligibleAt stays null (let `capped` + `kind` explain the edit).
    capped = emptyAttempts >= maxAttempts;
  } else if (failing === "failed") {
    // Hard failure: time-decaying backoff. After the ceiling, an auto-retry is
    // withheld only until the backoff window elapses — then it self-heals.
    const lastFailedAt = facts.lastFailedExtractionAt?.getTime() ?? null;
    const inBackoff =
      failedAttempts >= maxFailedAttempts &&
      lastFailedAt !== null &&
      input.now.getTime() - lastFailedAt < failedBackoffMs;
    capped = inBackoff;
    if (inBackoff && lastFailedAt !== null) {
      retryEligibleAt = lastFailedAt + failedBackoffMs;
    }
  }

  // 90s throttle indicator: only when time-gated AND still auto-retryable now
  // (a currently-capped chapter already surfaced its own retry time above).
  if (retryEligibleAt === null && throttled && !capped && facts.updatedAt) {
    retryEligibleAt = facts.updatedAt.getTime() + minIntervalMs;
  }

  return {
    state,
    kind: failing,
    capped,
    attempts,
    reason: failing === "failed" ? facts.lastFailureReason ?? null : null,
    lowYield: state === "checked" && facts.lowYield === true,
    throttled,
    retryEligibleAt,
  };
}
