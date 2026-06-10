import { NextResponse } from "next/server";
import { checkDependencies } from "@/lib/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const readiness = await checkDependencies();
  return NextResponse.json(readiness, { status: readiness.ok ? 200 : 503 });
}
