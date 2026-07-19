// suites/_lib.mjs — shared suite helpers.
//
// A suite exports `async function run(ctx)` and returns { checks, coverage, extra }.
// ctx = { bundleDir, store, manifest, http, scenario, workerProof, redactor, clock,
//         args, secret } (assembled by run.mjs).
//
// withBracket() wraps a measurement block in a worker-proof bracket so every
// artifact captured inside carries a consistent open/close census (§2.2, §4).

/**
 * Open a worker-proof bracket, run fn(bracketId), always close it.
 * @param {object} ctx
 * @param {string} bracketId
 * @param {(bracketId: string) => Promise<any>} fn
 */
export async function withBracket(ctx, bracketId, fn) {
  const open = await ctx.workerProof.openBracket(ctx.store, bracketId);
  try {
    return await fn(bracketId);
  } finally {
    await ctx.workerProof.closeBracket(ctx.store, open);
  }
}

/** Terminal coverage check from the scenario's pre-registered N. */
export function coverageCheck(scenario, observed, id = "coverage") {
  const declaredN = scenario?.preRegistered?.n ?? 0;
  const unit = scenario?.preRegistered?.unit ?? "samples";
  const pass = observed >= declaredN;
  return {
    id,
    method: "countAtLeast",
    args: { declaredN, unit },
    source: null,
    observed,
    pass,
    verdict: pass ? "MET" : "UNDER-N",
    detail: pass ? null : `observed ${observed} < pre-registered ${declaredN} ${unit}`,
  };
}
