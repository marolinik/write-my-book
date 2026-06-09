import { NextResponse } from "next/server";
import { checkDependencies } from "@/lib/health/dependencies";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await checkDependencies();
  return NextResponse.json(readiness, { status: readiness.ok ? 200 : 503 });
}
