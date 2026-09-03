import { NextResponse } from "next/server";
import { envHealth } from "@/lib/env";

export async function GET() {
  const env = envHealth("web");
  const status = env.ok ? 200 : 503;

  // H3: the full env report names which required/optional secrets are
  // missing (STRIPE_*, S3_*, DEV_AUTH_BYPASS…) — an anonymous configuration
  // map. Production keeps the liveness verdict + booleans only; the detailed
  // report stays available in dev/CI (env:check scripts consume it) and in
  // server logs. Dependency-level detail (DB/Redis/S3/…) lives on
  // /api/health/dependencies, gated separately.
  const detailed = process.env.NODE_ENV !== "production";

  return NextResponse.json(
    {
      status: env.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      env: detailed ? env : { ok: env.ok, target: env.target },
    },
    { status }
  );
}
