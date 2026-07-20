import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    // Split costs: LLM agents vs embeddings
    const llmCosts = records
      .filter((r) => r.agentType !== "embedding")
      .reduce(
        (acc, r) => ({
          costEstimate: acc.costEstimate + r.costEstimate,
          sessions: acc.sessions + 1,
        }),
        { costEstimate: 0, sessions: 0 }
      );

    const embeddingRecords = records.filter((r) => r.agentType === "embedding");
    const embeddingCosts = {
      costEstimate: embeddingRecords.reduce((sum, r) => sum + r.costEstimate, 0),
      tokens: embeddingRecords.reduce((sum, r) => sum + r.tokensInput, 0),
    };
    const embeddingTokens = embeddingCosts.tokens;

    return NextResponse.json({
      total,
      byAgent,
      records,
      llmCosts,
      embeddingCosts,
      embeddingTokens,
    });
  } catch (error) {
    console.error("GET /api/usage/books/:bookId error:", error);
    return NextResponse.json(
      { error: "Failed to load usage" },
      { status: 500 }
    );
  }
}
