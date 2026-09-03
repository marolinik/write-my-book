import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkDependencies } from "@/lib/health/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * H3 trust gate. This probe burns ~6 outbound connections per real run and
 * its per-dependency messages can map the internal network, so:
 * - container healthchecks keep working: a direct request (no proxy headers)
 *   whose Host is loopback is treated as the local orchestrator;
 * - external callers get the full detail only when HEALTH_TOKEN is set and
 *   the x-health-token header matches in constant time;
 * - everyone else still gets the readiness verdict (200/503 + names/status —
 *   what LBs and CI smoke need) but never the messages.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function trustOf(req: NextRequest): "authorized" | "loopback" | "public" {
  const token = process.env.HEALTH_TOKEN?.trim();
  if (token) {
    const given = req.headers.get("x-health-token") ?? "";
    if (given && constantTimeEquals(given, token)) return "authorized";
  }
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const loopbackHost =
    host === "" || // direct socket without Host header
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  if (!forwarded && loopbackHost) return "loopback";
  return "public";
}

export async function GET(req: NextRequest) {
  const trust = trustOf(req);
  const readiness = await checkDependencies();

  // Public + production: verdict yes/no, no host/port echoes, no env map.
  const hideDetail = trust === "public" && process.env.NODE_ENV === "production";

  const body = hideDetail
    ? {
        ok: readiness.ok,
        status: readiness.status,
        checkedAt: readiness.checkedAt,
        dependencies: readiness.dependencies.map(({ name, status, required }) => ({
          name,
          status,
          required,
        })),
        detail: "hidden",
      }
    : readiness;

  return NextResponse.json(body, { status: readiness.ok ? 200 : 503 });
}
