/**
 * D2 — the estimate stops guessing once the book has paid for enough runs.
 *
 * `estimateWorkflowCost` multiplies a hand-written token heuristic by the
 * model's list price, and it has never looked at what a run actually cost.
 * Measured drift on real batches was 30-38%. The writer sees that number
 * before agreeing to spend money, so a third of the number is a third of their
 * trust.
 *
 * Every paid agent run leaves a row in `UsageRecord`. After a handful of them,
 * this book's own spread is a better answer than any table — and, unlike the
 * heuristic, it is a claim the writer can check: "based on your last 7 runs".
 */

/** Below this many real runs, the evidence is an anecdote and we stay quiet. */
export const MIN_CALIBRATION_RUNS = 4;

/** How wide a band the middle of the evidence is reported as. */
const LOWER_PERCENTILE = 0.2;
const UPPER_PERCENTILE = 0.8;

/**
 * A repeated identical cost is not proof the next run is identical. Even a
 * perfectly consistent history is reported with this much give on each side.
 */
const MINIMUM_SPREAD = 0.15;

export interface CostRange {
  min: number;
  max: number;
}

export interface CalibratedEstimate extends CostRange {
  /** How many real runs this is drawn from — the product says this out loud. */
  basedOn: number;
}

/** The value at `p` through a sorted sample, interpolating between neighbours. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Replace a heuristic estimate with one drawn from this book's own runs.
 *
 * @param actualCosts  what past runs of this kind actually cost, any order
 * @param heuristic    the table-driven estimate, returned to the caller's use
 *                     when there is not yet enough evidence
 * @returns the calibrated range, or null when the heuristic should stand
 */
export function calibrateEstimate(
  actualCosts: readonly number[],
  heuristic: CostRange
): CalibratedEstimate | null {
  void heuristic;

  // A run that billed nothing is a failure, not evidence that runs are free.
  const observed = actualCosts.filter((cost) => Number.isFinite(cost) && cost > 0);
  if (observed.length < MIN_CALIBRATION_RUNS) return null;

  const sorted = [...observed].sort((a, b) => a - b);
  const low = percentile(sorted, LOWER_PERCENTILE);
  const high = percentile(sorted, UPPER_PERCENTILE);

  // Give the band room even when every run landed on the same number.
  const centre = (low + high) / 2;
  const give = Math.max((high - low) / 2, centre * MINIMUM_SPREAD);

  return {
    min: Math.max(0, centre - give),
    max: centre + give,
    basedOn: observed.length,
  };
}
