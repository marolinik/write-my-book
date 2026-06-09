import { NextResponse } from "next/server";
import { envHealth } from "@/lib/env";
import { checkDependencies } from "@/lib/health/dependencies";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = envHealth("web");
  if (!env.ok) {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        env,
        dependencies: null,
      },
      { status: 503 }
    );
  }

  const dependencies = await checkDependencies();
  return NextResponse.json(
    {
      status: dependencies.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      env,
      dependencies,
    },
    { status: dependencies.ok ? 200 : 503 }
  );
}
