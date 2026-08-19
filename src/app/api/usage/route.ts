import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { validatePrices } from "@/lib/llm/price-validator";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await db.usageRecord.findMany({
      where: {
        userId: user.id,
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

    const byModel = records.reduce(
      (acc, r) => {
        const key = r.model;
        if (!acc[key]) {
          acc[key] = { tokensInput: 0, tokensOutput: 0, costEstimate: 0 };
        }
        acc[key].tokensInput += r.tokensInput;
        acc[key].tokensOutput += r.tokensOutput;
        acc[key].costEstimate += r.costEstimate;
        return acc;
      },
      {} as Record<string, { tokensInput: number; tokensOutput: number; costEstimate: number }>
    );

    const byBookMap = records.reduce(
      (acc, r) => {
        const key = r.bookId;
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

    const bookIds = Object.keys(byBookMap);
    const books = bookIds.length > 0
      ? await db.book.findMany({
          where: { id: { in: bookIds } },
          select: { id: true, name: true },
        })
      : [];
    const bookNameMap = new Map(books.map((b) => [b.id, b.name]));

    const byBook = Object.entries(byBookMap)
      .map(([bookId, data]) => ({
        bookId,
        bookName: bookNameMap.get(bookId) ?? "Deleted Book",
        ...data,
      }))
      .sort((a, b) => b.costEstimate - a.costEstimate);

    const byKeySource = records.reduce(
      (acc, r) => {
        const key = r.keySource ?? "user";
        if (!acc[key]) acc[key] = { costEstimate: 0, sessions: 0 };
        acc[key].costEstimate += r.costEstimate;
        acc[key].sessions += 1;
        return acc;
      },
      {} as Record<string, { costEstimate: number; sessions: number }>
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

    // Compute cost drift from recent sessions with both estimate and actual
    const driftSessions = await db.agentSession.findMany({
      where: {
        userId: user.id,
        completedAt: { gte: thirtyDaysAgo },
        estimatedCostUsd: { not: null },
        actualCostUsd: { not: null },
      },
      select: {
        estimatedCostUsd: true,
        actualCostUsd: true,
      },
    });

    let driftPercentage: number | null = null;
    if (driftSessions.length >= 3) {
      // Need at least 3 sessions for meaningful drift
      const totalEstimated = driftSessions.reduce(
        (sum, s) => sum + (s.estimatedCostUsd ?? 0),
        0
      );
      const totalActual = driftSessions.reduce(
        (sum, s) => sum + (s.actualCostUsd ?? 0),
        0
      );
      if (totalEstimated > 0) {
        driftPercentage = Math.round(
          Math.abs((totalEstimated - totalActual) / totalEstimated) * 100
        );
      }
    }

    // Fetch cached price validation (does NOT trigger a new fetch if no cache)
    let priceDiscrepancies: number = 0;
    try {
      const priceResult = await validatePrices();
      priceDiscrepancies = priceResult.discrepancies.length;
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      total,
      byAgent,
      byModel,
      byBook,
      byKeySource,
      llmCosts,
      embeddingCosts,
      costDrift: {
        driftPercentage,
        sessionsAnalyzed: driftSessions.length,
        warningThreshold: 20,
        hasWarning: driftPercentage !== null && driftPercentage > 20,
      },
      priceDiscrepancies,
    });
  } catch (error) {
    console.error("GET /api/usage error:", error);
    return NextResponse.json(
      { error: "Failed to load usage" },
      { status: 500 }
    );
  }
}
