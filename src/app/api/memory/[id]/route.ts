import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  content: z.string().min(1).max(1000),
});

/**
 * P7-S02: the write is scoped to the caller's own rows, so a foreign id
 * matches nothing. Say so with a 404 instead of a success that changed
 * nothing.
 */
function memoryNotFound() {
  return NextResponse.json({ error: "Memory not found" }, { status: 404 });
}

/** PATCH /api/memory/:id — update a memory's content */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(req);
    const data = updateSchema.parse(body);

    const { count } = await db.writerMemory.updateMany({
      where: { id, userId: user.id },
      data: { content: data.content },
    });
    if (count === 0) return memoryNotFound();

    return NextResponse.json({ success: true });
  } catch (err) {
    const invalidJson = invalidJsonBodyResponse(err);
    if (invalidJson) return invalidJson;
    const zodRes = zodErrorResponse(err);
    if (zodRes) return zodRes;
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

    const { count } = await db.writerMemory.updateMany({
      where: { id, userId: user.id },
      data: { active: false },
    });
    if (count === 0) return memoryNotFound();

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete" },
      { status: 500 }
    );
  }
}
