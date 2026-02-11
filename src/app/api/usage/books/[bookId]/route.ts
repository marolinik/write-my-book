import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const user = await requireUser();
    const { bookId } = await params;

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await db.usageRecord.findMany({
      where: {
        userId: user.id,
        bookId,
        recordedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { recordedAt: "desc" },
      take: 20,
    });

    const byAgent = records.reduce(
      (acc, r) => {
        const key = r.agentType;
        if (!acc[key]) {
          acc[key] = { tokensInput: 0, tokensOutput: 0, costEstimate: 0, sessions: 0 };
        }
        acc[key].tokensInput += r.tokensInput;
        acc[key].tokensOutput += r.tokensOutput;
        acc[key].costEstimate += r.costEstimate;
        acc[key].sessions += 1;
        return acc;
      },
      {} as Record<string, { tokensInput: number; tokensOutput: number; costEstimate: number; sessions: number }>
    );

    const total = records.reduce(
      (acc, r) => ({
        tokensInput: acc.tokensInput + r.tokensInput,
        tokensOutput: acc.tokensOutput + r.tokensOutput,
        costEstimate: acc.costEstimate + r.costEstimate,
        sessions: acc.sessions + 1,
      }),
      { tokensInput: 0, tokensOutput: 0, costEstimate: 0, sessions: 0 }
    );

    return NextResponse.json({
      total,
      byAgent,
      records,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
