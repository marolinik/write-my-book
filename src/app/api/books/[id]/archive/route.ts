import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { checkPlanAccess } from "@/lib/billing/plan-gating";

const archiveSchema = z.object({ archived: z.boolean() });

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/archive — archive (archived=true) or restore (false) a book. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { archived } = archiveSchema.parse(await parseJsonBody(req));

    // Restoring takes an active-book slot back (Wave 2 review I2): without
    // this, archive, create, restore gave any number of active books.
    if (!archived) {
      const archivedBook = await db.book.findFirst({
        where: { id, userId: user.id, archivedAt: { not: null } },
        select: { id: true },
      });
      if (archivedBook) {
        const access = await checkPlanAccess(user.id, "restore_book");
        if (!access.allowed) {
          return NextResponse.json(
            { error: access.reason, upgradeToTier: access.upgradeToTier },
            { status: 403 }
          );
        }
      }
    }

    // Ownership-fenced, atomic: only the caller's book is touched.
    const result = await db.book.updateMany({
      where: { id, userId: user.id },
      data: { archivedAt: archived ? new Date() : null },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    return NextResponse.json({ archived });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("POST /api/books/:id/archive error:", error);
    return NextResponse.json({ error: "Failed to archive" }, { status: 500 });
  }
}
