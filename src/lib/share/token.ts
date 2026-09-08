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
 * A tiny in-memory fixed-window rate limiter for the public share endpoints.
 * Per-process — acceptable for the single-instance default; documented as reset
 * on restart. Keyed by client IP (x-forwarded-for head / x-real-ip / "unknown").
 */
export class InMemoryRateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private windowMs: number,
    private limit: number
  ) {}

  /** Returns true when the caller is allowed to proceed. */
  allow(key: string, now = Date.now()): boolean {
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
}

/** Get a reasonable client-IP key from the request headers (no DNS lookups). */
export function clientIpFrom(req: { get(name: string): string | null }): string {
  const fwd = req.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.get("x-real-ip") ?? "unknown";
}

/**
 * Shared, per-process fixed-window limiter for the PUBLIC share surface (page +
 * GET loader). 120 loads / 60s per IP. Docs note: resets on restart; acceptable
 * for the single-instance default.
 */
export const publicShareLimiter = new InMemoryRateLimiter(60_000, 120);