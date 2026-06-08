import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateLanguageSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ language: user.preferredLanguage ?? "en" });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = updateLanguageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { preferredLanguage: parsed.data.language },
    });

    return NextResponse.json({ language: parsed.data.language });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
