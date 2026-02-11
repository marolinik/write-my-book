import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();

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
      byModel,
      byBook,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
