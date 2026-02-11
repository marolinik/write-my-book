import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFindingSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string; findingId: string }> };

/** PATCH /api/books/:id/editorial/findings/:findingId — Apply or dismiss a finding. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const finding = await db.editFinding.findFirst({
      where: { id: findingId, bookId },
    });
    if (!finding) {
      return NextResponse.json(
        { error: "Finding not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const data = updateFindingSchema.parse(body);

    const updateData: Record<string, unknown> =
      data.action === "apply"
        ? { status: "applied", appliedAt: new Date() }
        : { status: "dismissed", dismissReason: data.reason ?? null };

    const updated = await db.editFinding.update({
      where: { id: findingId },
      data: updateData,
    });

    await db.editAction.create({
      data: {
        bookId,
        chapterNumber: finding.chapterNumber,
        actionType: data.action,
        findingId,
        description:
          data.action === "apply"
            ? `Applied finding: ${finding.category}`
            : `Dismissed finding: ${finding.category}${data.reason ? ` — ${data.reason}` : ""}`,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error(
      "PATCH /api/books/:id/editorial/findings/:findingId error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update finding" },
      { status: 500 }
    );
  }
}
