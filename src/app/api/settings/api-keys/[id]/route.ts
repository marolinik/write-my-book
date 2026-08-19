import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateApiKey } from "@/lib/llm/key-validator";
import { decryptApiKey } from "@/lib/encryption";
import type { ProviderKey } from "@/lib/llm/providers";

/**
 * GET /api/settings/api-keys/[id]
 * On-demand key health check: re-validates the key against the provider
 * and updates validatedAt (or clears it on failure).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const key = await db.apiKey.findFirst({
      where: { id, userId: user.id },
      select: { id: true, provider: true, encryptedKey: true },
    });

    if (!key) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    const decrypted = decryptApiKey(key.encryptedKey);
    const result = await validateApiKey(key.provider as ProviderKey, decrypted);

    if (result.valid) {
      const now = new Date();
      await db.apiKey.update({
        where: { id },
        data: { validatedAt: now },
      });
      return NextResponse.json({ valid: true, validatedAt: now.toISOString() });
    } else {
      // Clear validatedAt to mark key as invalid
      await db.apiKey.update({
        where: { id },
        data: { validatedAt: null },
      });
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 200 } // 200 — the request succeeded, the key failed validation
      );
    }
  } catch (error) {
    console.error("GET /api/settings/api-keys/:id error:", error);
    return NextResponse.json(
      { error: "Failed to check API key" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/api-keys/[id]
 * Delete an API key. Blocks removal of last key and during active sessions.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify key exists and belongs to user
    const key = await db.apiKey.findFirst({
      where: { id, userId: user.id },
    });

    if (!key) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    // Block removal of last key
    const totalKeys = await db.apiKey.count({
      where: { userId: user.id },
    });

    if (totalKeys <= 1) {
      return NextResponse.json(
        {
          error:
            "Cannot remove your last API key. You must have at least one active key.",
        },
        { status: 400 }
      );
    }

    // Block removal while agent sessions are running
    const runningSessions = await db.agentSession.count({
      where: { userId: user.id, status: "running" },
    });

    if (runningSessions > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot remove key while agent sessions are running.",
        },
        { status: 409 }
      );
    }

    // Delete the key
    await db.apiKey.delete({ where: { id } });

    // If deleted key was default, promote another key
    if (key.isDefault) {
      const nextDefault = await db.apiKey.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });

      if (nextDefault) {
        await db.apiKey.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/settings/api-keys/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 }
    );
  }
}
