import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportConfigUpdateSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import {
  getDefaultExportConfig,
  parseExportConfigJson,
  serializeExportConfig,
} from "@/lib/import-export/export-config";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/export/config — read export config or return defaults. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const docService = new DocumentService(user.id, bookId);
    const doc = await docService.findByType(DocumentType.EXPORT_CONFIG);

    if (doc) {
      const result = await docService.read(doc.id);
      if (result?.content) {
        try {
          const config = parseExportConfigJson(result.content);
          return NextResponse.json(config);
        } catch {
          // Invalid JSON, return defaults
        }
      }
    }

    return NextResponse.json(getDefaultExportConfig(book.name));
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/export/config error:", error);
    return NextResponse.json(
      { error: "Failed to fetch export config" },
      { status: 500 }
    );
  }
}

/** PUT /api/books/:id/export/config — update export config (partial merge). */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const body = await parseJsonBody(req);
    const updates = exportConfigUpdateSchema.parse(body);

    const docService = new DocumentService(user.id, bookId);
    const doc = await docService.findByType(DocumentType.EXPORT_CONFIG);

    // Load existing config or defaults
    let config = getDefaultExportConfig(book.name);
    if (doc) {
      const result = await docService.read(doc.id);
      if (result?.content) {
        try {
          config = parseExportConfigJson(result.content);
        } catch {
          // Use defaults on parse error
        }
      }
    }

    // Deep merge updates into config
    const merged = deepMerge(config, updates);
    const serialized = serializeExportConfig(merged);

    if (doc) {
      await docService.update(doc.id, serialized, undefined, "manual_edit", "user");
    } else {
      await docService.create(
        DocumentType.EXPORT_CONFIG,
        serialized,
        "Export Configuration",
        undefined,
        undefined,
        "user"
      );
    }

    return NextResponse.json(merged);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error("PUT /api/books/:id/export/config error:", error);
    return NextResponse.json(
      { error: "Failed to update export config" },
      { status: 500 }
    );
  }
}

/** Deep merge source into target. Only merges plain objects, not arrays. */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = (result as Record<string, unknown>)[key];
    if (
      srcVal !== undefined &&
      typeof srcVal === "object" &&
      srcVal !== null &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === "object" &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>
      );
    } else if (srcVal !== undefined) {
      (result as Record<string, unknown>)[key] = srcVal;
    }
  }
  return result;
}
