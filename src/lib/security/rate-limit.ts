import { getAppConnection } from "@/lib/queue/connection";

/**
 * Review M-5: a request waits at most this long for the limiter. Two commands
 * with the connection's 5 s timeout each stalled an import ~10 s before it
 * failed open when Redis was down.
 */
export const RATE_LIMIT_TIMEOUT_MS = 1_000;

const TIMED_OUT = Symbol("rate-limit-timeout");

/**
 * Fixed-window counter per key (P1-24). The window starts with SET NX EX, so
 * the key always carries its expiry even if a later call fails; INCR keeps it.
 * Both go in one MULTI round trip. When Redis is unreachable or slow the
 * request is allowed: the size guards still bound the work, and an outage
 * must not lock every writer out of import.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const redis = getAppConnection();
    const exec = redis.multi().set(redisKey, 0, "EX", windowSeconds, "NX").incr(redisKey).exec();
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), RATE_LIMIT_TIMEOUT_MS);
    });
    const result = await Promise.race([exec, timeout]);
    if (result === TIMED_OUT) {
      console.error(`[rate-limit] ${key}: Redis did not answer in ${RATE_LIMIT_TIMEOUT_MS} ms, allowing the request`);
      return true;
    }
    const counted = result?.[1];
    if (!counted || counted[0]) throw counted?.[0] ?? new Error("MULTI returned no count");
    return Number(counted[1]) <= limit;
  } catch (error) {
    console.error(`[rate-limit] ${key}: Redis unavailable, allowing the request`, error);
    return true;
  } finally {
    clearTimeout(timer);
  }
}
