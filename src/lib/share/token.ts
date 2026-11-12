import { randomBytes, timingSafeEqual } from "node:crypto";

/** Generate a high-entropy share token (48 hex chars). */
export function generateShareToken(): string {
  return randomBytes(24).toString("hex");
}

/** Constant-time string compare (mirrors the health-token pattern). */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const VALID_CHARS = /^[0-9a-f]{48}$/;

/** Validate a token from a URL param before any DB lookup. */
export function isValidShareToken(token: string): boolean {
  return VALID_CHARS.test(token);
}

/**
 * An in-memory fixed-window limiter. P2-23: it is now only the backstop for
 * when Redis is unreachable (the shared limiter fails open), and it evicts
 * expired keys so spoofed addresses cannot grow the map forever.
 */
export class InMemoryRateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(
    private windowMs: number,
    private limit: number
  ) {}

  /** Returns true when the caller is allowed to proceed. */
  allow(key: string, now = Date.now()): boolean {
    this.sweep(now);
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    if (entry.count > this.limit) {
      // Don't let a single key grow unbounded.
      entry.count = this.limit + 1;
      return false;
    }
    return true;
  }

  /** Number of keys held (for tests and diagnostics). */
  size(): number {
    return this.hits.size;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }
}

/**
 * The client address, as our own proxies recorded it. P2-23: the FIRST
 * x-forwarded-for entry is whatever the client sent; each trusted proxy
 * appends the address it saw, so the client is the entry TRUSTED_PROXY_HOPS
 * from the right (default 1: one reverse proxy in front of the app).
 */
export function clientIpFrom(req: { get(name: string): string | null }): string {
  const fwd = req.get("x-forwarded-for");
  if (fwd) {
    const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
    const chain = fwd.split(",").map((part) => part.trim()).filter(Boolean);
    if (chain.length > 0) return chain[Math.max(0, chain.length - hops)];
  }
  return req.get("x-real-ip")?.trim() || "unknown";
}

const SHARE_WINDOW_SECONDS = 60;
/** Loads per client address per minute, across the page and the API. */
const SHARE_LIMIT_PER_IP = 120;
/** Loads per link per minute from everyone together: caps a distributed scrape. */
const SHARE_LIMIT_PER_TOKEN = 600;

/** Per-process backstop with the same per-address budget, for a Redis outage. */
export const publicShareLimiter = new InMemoryRateLimiter(SHARE_WINDOW_SECONDS * 1000, SHARE_LIMIT_PER_IP);

/**
 * One budget for the public share surface (page and GET loader), shared by
 * every instance through Redis, counted per client address and per token.
 */
export async function allowShareLoad(
  headers: { get(name: string): string | null },
  token: string
): Promise<boolean> {
  const { rateLimit } = await import("@/lib/security/rate-limit");
  const ip = clientIpFrom(headers);
  if (!publicShareLimiter.allow(ip)) return false;
  const [byIp, byToken] = await Promise.all([
    rateLimit(`share-ip:${ip}`, SHARE_LIMIT_PER_IP, SHARE_WINDOW_SECONDS),
    rateLimit(`share-token:${token}`, SHARE_LIMIT_PER_TOKEN, SHARE_WINDOW_SECONDS),
  ]);
  return byIp && byToken;
}
