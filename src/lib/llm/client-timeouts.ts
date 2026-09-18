/**
 * O5 / O6 — deadlines and backoff for the self-hosted fleet.
 *
 * `qwen3.8-27b-uncensored` (Zika) answers `/v1/models` while its weights are not
 * resident, so the gateway looks healthy and the first real request after an
 * idle period can take minutes to produce its first token. The model is fine;
 * the client deadline was wrong. Hosted providers keep the SDK default, because
 * a hosted request that hangs for fifteen minutes is a fault, not a warm-up.
 *
 * Pure: no SDK, no env, no I/O — the numbers are the contract and the tests read
 * them directly.
 */

const MINUTE = 60_000;

/** Local fleet models: a LAN gateway with a model already resident. */
const LOCAL_TIMEOUT_MS = 10 * MINUTE;

/** Families whose weights may need loading before the first token. */
const COLD_START_TIMEOUT_MS = 20 * MINUTE;
const COLD_START_FAMILIES = ["local-zika", "27b", "uncensored"];

/**
 * Client timeout for a model id, or undefined to keep the SDK default.
 */
export function clientTimeoutMsFor(modelId: string): number | undefined {
  if (!modelId) return undefined;
  const id = modelId.toLowerCase();
  if (COLD_START_FAMILIES.some((f) => id.includes(f))) return COLD_START_TIMEOUT_MS;
  if (id.startsWith("local-")) return LOCAL_TIMEOUT_MS;
  return undefined;
}

const REDIS_BASE_DELAY_MS = 500;
const REDIS_MAX_DELAY_MS = 30_000;

/**
 * Backoff between Redis reconnection attempts. ioredis defaults to roughly
 * 50ms * attempt capped at 2s, which is what let a worker write ~80k
 * ECONNREFUSED lines while Docker was down. Exponential with a 30s ceiling
 * keeps a long outage quiet without making recovery slow.
 */
export function redisRetryDelayMs(attempt: number): number {
  const exponential = REDIS_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, REDIS_MAX_DELAY_MS);
}
