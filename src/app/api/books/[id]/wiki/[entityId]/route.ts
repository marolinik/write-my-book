import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { wikiEntityUpdateSchema } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
  const user = await requireUser();
  const { id: bookId, entityId } = await params;

  const entity = await db.wikiEntity.findFirst({
    where: { id: entityId, bookId, book: { userId: user.id } },
  });
  if (!entity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(entity);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
  const user = await requireUser();
  const { id: bookId, entityId } = await params;

  const existing = await db.wikiEntity.findFirst({
    where: { id: entityId, bookId, book: { userId: user.id } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
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
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> }
) {
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
}
