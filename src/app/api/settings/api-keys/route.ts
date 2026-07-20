import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey, maskApiKey } from "@/lib/encryption";
import { createApiKeySchema } from "@/lib/validation";
import { validateApiKey } from "@/lib/llm/key-validator";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { aggregateUsageByProvider } from "@/lib/llm/usage-aggregation";

/**
 * GET /api/settings/api-keys
 * Returns all API keys for the authenticated user with per-provider usage stats.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await db.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        label: true,
        isDefault: true,
        validatedAt: true,
        createdAt: true,
        encryptedKey: true,
      },
    });

    // Roll up usage per provider. UsageRecord.model holds the registry ID
    // (e.g. "openrouter-qwen36/sonnet"), so we group by model and attribute
    // each id to its provider via the registry — D-44: the previous
    // `model.startsWith(`${provider}/`)` match missed every "openrouter-*"
    // sub-variant and reported $0 against real spend.
    const usageGroups = await db.usageRecord.groupBy({
      by: ["model"],
      where: { userId: user.id },
      _sum: {
        tokensInput: true,
        tokensOutput: true,
        costEstimate: true,
      },
      _count: { _all: true },
    });

    const usageByProvider = aggregateUsageByProvider(
      usageGroups.map((g) => ({
        model: g.model,
        tokensInput: g._sum.tokensInput ?? 0,
        tokensOutput: g._sum.tokensOutput ?? 0,
        costEstimate: g._sum.costEstimate ?? 0,
        sessionCount: g._count._all,
      }))
    );

    // Decrypt + mask keys and attach usage stats
    const result = keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      label: k.label,
      isDefault: k.isDefault,
      validatedAt: k.validatedAt,
      createdAt: k.createdAt,
      maskedKey: maskApiKey(decryptApiKey(k.encryptedKey)),
      usage: usageByProvider.get(k.provider) ?? {
        totalTokens: 0,
        totalCost: 0,
        sessionCount: 0,
      },
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/settings/api-keys error:", error);
    return NextResponse.json(
      { error: "Failed to load API keys" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/api-keys
 * Upsert an API key for a provider. Validates the key before storing.
 * Returns 400 if validation fails (unvalidated keys are never stored).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(req);

    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return (
        zodErrorResponse(parsed.error) ??
        NextResponse.json({ error: "Invalid input" }, { status: 400 })
      );
    }

    const { provider, key, label } = parsed.data;

    // Validate key against provider API -- reject if invalid
    const validation = await validateApiKey(provider, key);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error ?? "API key validation failed",
          provider,
        },
        { status: 400 }
      );
    }

    const encrypted = encryptApiKey(key);
    const now = new Date();

    // One query answers both facts we need: whether ANY key exists (→ first key
    // becomes the default) and whether THIS provider's key already exists (→ the
    // upsert is an update, not a create).
    const existingKeys = await db.apiKey.findMany({
      where: { userId: user.id },
      select: { provider: true },
    });
    const isFirstKey = existingKeys.length === 0;
    const keyAlreadyExists = existingKeys.some((k) => k.provider === provider);

    // Upsert: one key per provider per user
    const apiKey = await db.apiKey.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider,
        },
      },
      create: {
        userId: user.id,
        provider,
        encryptedKey: encrypted,
        label: label || null,
        isDefault: isFirstKey, // first key is default
        validatedAt: now,
      },
      update: {
        encryptedKey: encrypted,
        label: label || null,
        validatedAt: now,
      },
    });

    // D-59: answer honestly — 201 Created only when a new row was inserted,
    // 200 OK when an existing provider key was updated. Reporting 201 for a
    // pre-existing key misrepresents an idempotent update as a creation.
    return NextResponse.json(
      {
        id: apiKey.id,
        provider: apiKey.provider,
        label: apiKey.label,
        isDefault: apiKey.isDefault,
        validatedAt: apiKey.validatedAt,
        maskedKey: maskApiKey(key),
        usage: null,
      },
      { status: keyAlreadyExists ? 200 : 201 }
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/settings/api-keys error:", error);
    return NextResponse.json(
      { error: "Failed to save API key" },
      { status: 500 }
    );
  }
}
