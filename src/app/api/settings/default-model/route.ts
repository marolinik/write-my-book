import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getModelDef } from "@/lib/llm";
import { z } from "zod";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

// ── Validation ─────────────────────────────────────────────────

/** Registry ID or null (to clear an override). */
const registryIdOrNull = z.string().min(1).max(50).nullable().optional();

// D-39: .strict() so an unknown key 400s instead of a silent 200. Clients
// (use-default-model, onboarding) send only defaultModel and/or the six role
// override fields below.
const updateDefaultModelSchema = z.object({
  defaultModel: z.string().min(1).max(50).optional(),
  modelGhostwriter: registryIdOrNull,
  modelEditor: registryIdOrNull,
  modelBetaReader: registryIdOrNull,
  modelAnalyst: registryIdOrNull,
  modelCoach: registryIdOrNull,
  modelCreative: registryIdOrNull,
}).strict();

// ── Role override field names ──────────────────────────────────

const ROLE_FIELDS = [
  "modelGhostwriter",
  "modelEditor",
  "modelBetaReader",
  "modelAnalyst",
  "modelCoach",
  "modelCreative",
] as const;

// ── GET ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireUser();
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        defaultModel: true,
        modelGhostwriter: true,
        modelEditor: true,
        modelBetaReader: true,
        modelAnalyst: true,
        modelCoach: true,
        modelCreative: true,
      },
    });

    return NextResponse.json({
      defaultModel: dbUser?.defaultModel ?? "anthropic/sonnet",
      modelGhostwriter: dbUser?.modelGhostwriter ?? null,
      modelEditor: dbUser?.modelEditor ?? null,
      modelBetaReader: dbUser?.modelBetaReader ?? null,
      modelAnalyst: dbUser?.modelAnalyst ?? null,
      modelCoach: dbUser?.modelCoach ?? null,
      modelCreative: dbUser?.modelCreative ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// ── PATCH ──────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(request);
    const parsed = updateDefaultModelSchema.safeParse(body);

    if (!parsed.success) {
      return (
        zodErrorResponse(parsed.error) ??
        NextResponse.json({ error: "Invalid input" }, { status: 400 })
      );
    }

    const data = parsed.data;

    // Validate defaultModel registry ID if provided
    if (data.defaultModel) {
      const modelDef = getModelDef(data.defaultModel);
      if (!modelDef) {
        return NextResponse.json(
          { error: "Unknown model ID for defaultModel" },
          { status: 400 }
        );
      }
    }

    // Validate role override registry IDs (if provided and not null)
    for (const field of ROLE_FIELDS) {
      const value = data[field];
      if (value !== undefined && value !== null) {
        const modelDef = getModelDef(value);
        if (!modelDef) {
          return NextResponse.json(
            { error: `Unknown model ID for ${field}: ${value}` },
            { status: 400 }
          );
        }
      }
    }

    // Build update payload with only provided fields
    const updatePayload: Record<string, string | null> = {};
    if (data.defaultModel !== undefined) {
      updatePayload.defaultModel = data.defaultModel;
    }
    for (const field of ROLE_FIELDS) {
      if (data[field] !== undefined) {
        updatePayload[field] = data[field] ?? null;
      }
    }

    await db.user.update({
      where: { id: user.id },
      data: updatePayload,
    });

    // Return updated state
    const updated = await db.user.findUnique({
      where: { id: user.id },
      select: {
        defaultModel: true,
        modelGhostwriter: true,
        modelEditor: true,
        modelBetaReader: true,
        modelAnalyst: true,
        modelCoach: true,
        modelCreative: true,
      },
    });

    return NextResponse.json({
      defaultModel: updated?.defaultModel ?? "anthropic/sonnet",
      modelGhostwriter: updated?.modelGhostwriter ?? null,
      modelEditor: updated?.modelEditor ?? null,
      modelBetaReader: updated?.modelBetaReader ?? null,
      modelAnalyst: updated?.modelAnalyst ?? null,
      modelCoach: updated?.modelCoach ?? null,
      modelCreative: updated?.modelCreative ?? null,
    });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
