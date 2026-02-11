import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const key = await db.apiKey.findFirst({
      where: { id, userId: user.id },
    });

    if (!key) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    await db.apiKey.delete({ where: { id } });

    // If the deleted key was the default, promote another key of the same provider
    if (key.isDefault) {
      const next = await db.apiKey.findFirst({
        where: { userId: user.id, provider: key.provider },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await db.apiKey.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
