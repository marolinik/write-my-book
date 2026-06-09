import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  content: z.string().min(1).max(1000),
});

/** PATCH /api/memory/:id — update a memory's content */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    await db.writerMemory.updateMany({
      where: { id, userId: user.id },
      data: { content: data.content },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 }
    );
  }
}

/** DELETE /api/memory/:id — deactivate a memory */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    await db.writerMemory.updateMany({
      where: { id, userId: user.id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete" },
      { status: 500 }
    );
  }
}
