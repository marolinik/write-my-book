import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey, maskApiKey } from "@/lib/encryption";
import { createApiKeySchema } from "@/lib/validation";

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

    // Mask the keys for display
    const masked = keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      label: k.label,
      isDefault: k.isDefault,
      validatedAt: k.validatedAt,
      createdAt: k.createdAt,
      maskedKey: maskApiKey(k.encryptedKey.split(":").pop() ?? "****"),
    }));

    return NextResponse.json(masked);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

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

    // Validate key against Anthropic API if provider is anthropic
    let validatedAt: Date | null = null;
    if (provider === "anthropic") {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        if (res.ok || res.status === 429) {
          // 429 means rate limited but key is valid
          validatedAt = new Date();
        }
      } catch {
        // Validation failed but we still store the key
      }
    }

    const encrypted = encryptApiKey(key);

    // If this is the first key for this provider, make it default
    const existingCount = await db.apiKey.count({
      where: { userId: user.id, provider },
    });

    const apiKey = await db.apiKey.create({
      data: {
        userId: user.id,
        provider,
        encryptedKey: encrypted,
        label: label || null,
        isDefault: existingCount === 0,
        validatedAt,
      },
    });

    return NextResponse.json(
      {
        id: apiKey.id,
        provider: apiKey.provider,
        label: apiKey.label,
        isDefault: apiKey.isDefault,
        validatedAt: apiKey.validatedAt,
        createdAt: apiKey.createdAt,
        maskedKey: maskApiKey(key),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
