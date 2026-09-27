import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateLanguageSchema } from "@/lib/validation";
import {
  normalizeUiLanguage,
  UI_SUPPORTED_LANGUAGES,
} from "@/lib/i18n/ui-strings";
import { isBookLanguage } from "@/lib/i18n/book-languages";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

export async function GET() {
  try {
    const user = await requireUser();
    const stored = user.preferredLanguage ?? "en";
    // P6-S22: a region tag stored raw before PATCH normalised it ("sr-RS")
    // is read as the code it resolves to, so the pickers it seeds can show it.
    return NextResponse.json({ language: normalizeUiLanguage(stored) ?? stored });
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
      return (
        zodErrorResponse(parsed.error) ??
        NextResponse.json({ error: "Invalid input" }, { status: 400 })
      );
    }

    // D-12: never claim success for a language the UI cannot render. Codes
    // without a dictionary previously got a 200 while the interface silently
    // stayed English. P6-S22: a region tag is stored as the dictionary code it
    // resolves to — "sr-RS" was stored raw, and the New Book picker, which
    // only knows base codes, then rendered empty and every create failed.
    const language = normalizeUiLanguage(parsed.data.language);
    if (!language) {
      const available = UI_SUPPORTED_LANGUAGES.map((l) => l.code).join(", ");
      // Book/prose language is a separate, per-book setting — but only promise
      // it for a code a book can actually be written in (not "hr", not "xx").
      const bookHint = isBookLanguage(parsed.data.language.split("-")[0])
        ? " You can still write books in this language — choose it when creating the book."
        : "";
      return NextResponse.json(
        {
          error: `"${parsed.data.language}" is not yet available as an interface language. Available interface languages: ${available}.${bookHint}`,
        },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { preferredLanguage: language },
    });

    return NextResponse.json({ language });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/settings/language error:", error);
    return NextResponse.json(
      { error: "Failed to update language" },
      { status: 500 }
    );
  }
}
