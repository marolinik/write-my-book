import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/[id]/daily-plan
 * Returns a personalized daily writing plan based on book state.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: {
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          status: true,
          wordCount: true,
          updatedAt: true,
        },
        orderBy: { chapterNumber: "asc" },
      },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pendingFindings = await db.editFinding.count({
    where: { bookId, status: "pending" },
  });

  const plan: Array<{
    id: string;
    type: "write" | "edit" | "review" | "plan";
    title: string;
    detail: string;
    estimatedMinutes: number;
    href: string;
    priority: "high" | "medium" | "low";
  }> = [];

  // Find chapters needing work
  const needsDevEdit = book.chapters.find(ch => ch.status === "drafted");
  const needsLineEdit = book.chapters.find(ch => ch.status === "dev_edited");
  const lastTouched = [...book.chapters].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];

  // Continue where they left off (skip chapters that are already done)
  if (lastTouched && lastTouched.status !== "beta_passed") {
    plan.push({
      id: "continue",
      type: "write",
      title: `Continue Ch.${lastTouched.chapterNumber}${lastTouched.title ? `: ${lastTouched.title}` : ""}`,
      detail: `You last worked on this chapter — keep the momentum going.`,
      estimatedMinutes: 30,
      href: `/books/${bookId}/chapters/${lastTouched.id}`,
      priority: "high",
    });
  }

  // Review findings
  if (pendingFindings > 5) {
    plan.push({
      id: "findings",
      type: "review",
      title: `Review ${pendingFindings} editorial findings`,
      detail: "Your AI editors have suggestions ready for review.",
      estimatedMinutes: Math.min(45, Math.ceil(pendingFindings * 1.5)),
      href: `/books/${bookId}/editorial`,
      priority: "medium",
    });
  }

  // Dev edit
  if (needsDevEdit) {
    plan.push({
      id: "dev-edit",
      type: "edit",
      title: `Dev edit Ch.${needsDevEdit.chapterNumber}`,
      detail: "Run a developmental edit to catch structural issues.",
      estimatedMinutes: 20,
      href: `/books/${bookId}/editorial`,
      priority: "medium",
    });
  }

  // Line edit
  if (needsLineEdit) {
    plan.push({
      id: "line-edit",
      type: "edit",
      title: `Line edit Ch.${needsLineEdit.chapterNumber}`,
      detail: "Polish the prose with a line-level edit.",
      estimatedMinutes: 15,
      href: `/books/${bookId}/editorial`,
      priority: "low",
    });
  }

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? "Good morning! Here\'s your plan for today."
    : hour < 17
      ? "Good afternoon! Here are your priorities."
      : "Good evening! A few things you could tackle.";

  return NextResponse.json({
    plan: plan.slice(0, 4),
    greeting,
  });
}
