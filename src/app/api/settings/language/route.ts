import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateLanguageSchema } from "@/lib/validation";
import {
  isUiLanguageSupported,
  UI_SUPPORTED_LANGUAGES,
} from "@/lib/i18n/ui-strings";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

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
    const body = await parseJsonBody(request);
    const parsed = updateLanguageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // D-12: never claim success for a language the UI cannot render. Codes
    // without a dictionary previously got a 200 while the interface silently
    // stayed English. Book/prose language is a separate, per-book setting and
    // still supports the full SUPPORTED_LANGUAGES list.
    if (!isUiLanguageSupported(parsed.data.language)) {
      const available = UI_SUPPORTED_LANGUAGES.map((l) => l.code).join(", ");
      return NextResponse.json(
        {
          error: `"${parsed.data.language}" is not yet available as an interface language. Available interface languages: ${available}. You can still write books in this language — choose it when creating the book.`,
        },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { preferredLanguage: parsed.data.language },
    });

    return NextResponse.json({ language: parsed.data.language });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
