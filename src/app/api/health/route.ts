import { NextResponse } from "next/server";
import { envHealth } from "@/lib/env";

export async function GET() {
  const env = envHealth("web");
  const status = env.ok ? 200 : 503;

  return NextResponse.json(
    {
      status: env.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      env,
    },
    { status }
  );
}
