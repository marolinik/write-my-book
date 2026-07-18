import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { wikiEntityUpdateSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

// D-15: these handlers had no top-level try/catch — a Zod failure (or an
// unauthenticated request) escaped as a raw 500 with an empty body. All
// handlers now answer with the standard {error, details?} envelope, matching
// the chapters-route pattern.
function wikiEntityErrorResponse(error: unknown, label: string) {
  if ((error as Error).message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((error as Error).name === "ZodError") {
    return NextResponse.json(
      { error: "Invalid input", details: error },
      { status: 400 }
    );
  }
  console.error(`${label} /api/books/:id/wiki/:entityId error:`, error);
  return NextResponse.json(
    { error: "Failed to process wiki entity request" },
    { status: 500 }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId, entityId } = await params;

    const entity = await db.wikiEntity.findFirst({
      where: { id: entityId, bookId, book: { userId: user.id } },
    });
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(entity);
  } catch (error) {
    return wikiEntityErrorResponse(error, "GET");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId, entityId } = await params;

    const existing = await db.wikiEntity.findFirst({
      where: { id: entityId, bookId, book: { userId: user.id } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // D-01 guard: malformed body answers 400, not a raw 500.
    let body: unknown;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      const invalidJson = invalidJsonBodyResponse(error);
      if (invalidJson) return invalidJson;
      throw error;
    }
    const { attributes, ...rest } = wikiEntityUpdateSchema.parse(body);

    const updated = await db.wikiEntity.update({
      where: { id: entityId },
      data: {
        ...rest,
        ...(attributes !== undefined
          ? { attributes: attributes as Record<string, string | number | boolean> }
          : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return wikiEntityErrorResponse(error, "PATCH");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId, entityId } = await params;

    const existing = await db.wikiEntity.findFirst({
      where: { id: entityId, bookId, book: { userId: user.id } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.wikiEntity.delete({ where: { id: entityId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return wikiEntityErrorResponse(error, "DELETE");
  }
}
