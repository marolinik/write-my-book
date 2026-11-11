import { getAppConnection } from "@/lib/queue/connection";

/**
 * Fixed-window counter per key (P1-24). The window starts with SET NX EX, so
 * the key always carries its expiry even if a later call fails; INCR keeps it.
 * When Redis is unreachable the request is allowed: the size guards still
 * bound the work, and an outage must not lock every writer out of import.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  try {
    const redis = getAppConnection();
    await redis.set(redisKey, 0, "EX", windowSeconds, "NX");
    const count = await redis.incr(redisKey);
    return count <= limit;
  } catch (error) {
    console.error(`[rate-limit] ${key}: Redis unavailable, allowing the request`, error);
    return true;
  }
}
