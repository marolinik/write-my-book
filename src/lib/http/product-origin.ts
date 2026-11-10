import type { NextRequest } from "next/server";

/**
 * The origin a writer's browser can reach, for every URL we hand to Stripe.
 *
 * Inside the standalone container `req.nextUrl.origin` is the server's own
 * advertised host (`http://0.0.0.0:3000`), so NEXT_PUBLIC_APP_URL, which
 * production requires, comes first. The request origin is the fallback for
 * local runs without it.
 */
export function productOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return configured || req.nextUrl.origin;
}
