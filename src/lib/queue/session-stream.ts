import type IORedis from "ioredis";

/**
 * A live event carries its index in the session's Redis list, so the SSE
 * route can subscribe first, replay the list, and drop the live copies of
 * what it already replayed (P2-15). The client still receives plain data.
 */
export function encodeLiveEvent(index: number, data: string): string {
  return JSON.stringify({ i: index, d: data });
}

/** A bare message (from a publisher that predates the envelope) has no index. */
export function decodeLiveEvent(raw: string): { index: number | null; data: string } {
  try {
    const parsed = JSON.parse(raw) as { i?: unknown; d?: unknown };
    if (typeof parsed?.i === "number" && typeof parsed?.d === "string") {
      return { index: parsed.i, data: parsed.d };
    }
  } catch {
    // not JSON: treat as a bare message
  }
  return { index: null, data: raw };
}

/**
 * Append an event to the session's catch-up list, THEN publish it with its
 * index. Publishing first (the old order) let a client that subscribed after
 * the publish but replayed before the rpush miss the event entirely.
 */
export async function appendSessionEvent(
  redis: Pick<IORedis, "rpush" | "expire" | "publish">,
  sessionId: string,
  data: string,
  ttlSeconds?: number
): Promise<number> {
  const listKey = `session:${sessionId}:messages`;
  const index = (await redis.rpush(listKey, data)) - 1;
  if (ttlSeconds) await redis.expire(listKey, ttlSeconds);
  await redis.publish(`session:${sessionId}`, encodeLiveEvent(index, data));
  return index;
}
