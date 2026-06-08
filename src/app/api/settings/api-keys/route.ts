import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey, maskApiKey } from "@/lib/encryption";
import { createApiKeySchema } from "@/lib/validation";
import { validateApiKey } from "@/lib/llm/key-validator";

/**
 * GET /api/settings/api-keys
 * Returns all API keys for the authenticated user with per-provider usage stats.
 */
export async function GET() {
  try {
    const user = await requireUser();

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

    // Gather per-provider usage stats in parallel
    const providers = [...new Set(keys.map((k) => k.provider))];
    const usageByProvider = new Map<
      string,
      { totalTokens: number; totalCost: number; sessionCount: number }
    >();

    await Promise.all(
      providers.map(async (provider) => {
        const agg = await db.usageRecord.aggregate({
          where: {
            userId: user.id,
            model: { startsWith: `${provider}/` },
          },
          _sum: {
            tokensInput: true,
            tokensOutput: true,
            costEstimate: true,
          },
          _count: { id: true },
        });

        usageByProvider.set(provider, {
          totalTokens: (agg._sum.tokensInput ?? 0) + (agg._sum.tokensOutput ?? 0),
          totalCost: agg._sum.costEstimate ?? 0,
          sessionCount: agg._count.id,
        });
      })
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const body = await req.json();

    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
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

    // Count existing keys to determine if this should be the default
    const existingKeyCount = await db.apiKey.count({
      where: { userId: user.id },
    });

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
        isDefault: existingKeyCount === 0, // first key is default
        validatedAt: now,
      },
      update: {
        encryptedKey: encrypted,
        label: label || null,
        validatedAt: now,
      },
    });

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
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
