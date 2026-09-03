import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey } from "@/lib/encryption";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import {
  UnsafeUrlError,
  allowPrivateModelHosts,
  readCappedText,
  safeExternalFetch,
} from "@/lib/ssrf-guard";

/**
 * Custom providers — user-added OpenAI-compatible endpoints (LAN vLLM boxes,
 * corporate proxies, self-hubs). Saved per user; discovery against
 * `${baseURL}/models` runs on save so the Settings picker always lists
 * what the endpoint actually serves (never stale).
 *
 * SECURITY: the discovery fetch runs SERVER-SIDE against a user-supplied URL.
 * Every hop is validated by the shared SSRF guard (src/lib/ssrf-guard.ts):
 * cloud metadata/link-local are always blocked; private LAN ranges only pass
 * when the operator opted in via WMB_ALLOW_PRIVATE_MODEL_HOSTS=1 (self-hosted
 * LAN boxes are a supported use case; hosted multi-tenant must not set it).
 * A validated provider URL is only ever used here — saved providers reach
 * inference through the env-configured local proxy route, never re-fetched.
 */

const WIRE_APIS = ["openai-completions"] as const;

const createSchema = z.object({
  displayName: z.string().min(1).max(80),
  baseURL: z.string().url(),
  api: z.enum(WIRE_APIS).optional().default("openai-completions"),
  apiKey: z.string().max(500).optional(),
});

interface DiscoveredModel {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
}

/** Fetch `${baseURL}/models` (OpenAI shape), bound 4MB, parse entries. */
async function discoverModels(baseURL: string, apiKey?: string): Promise<DiscoveredModel[]> {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const allowPrivate = allowPrivateModelHosts();
  let response;
  try {
    response = await safeExternalFetch(
      url,
      {
        headers: {
          accept: "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(15000),
      },
      { allowPrivate }
    );
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      // Refuse with a neutral message — never echo which internal probe
      // "worked" (pre-fix the error oracle enabled port scanning).
      throw new Error(
        allowPrivate
          ? "That base URL points at a blocked internal range."
          : "That base URL is not a publicly reachable endpoint. Self-hosted LAN providers require WMB_ALLOW_PRIVATE_MODEL_HOSTS=1 on the server."
      );
    }
    throw new Error("Could not reach the endpoint — check the base URL and your network.");
  }
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? " — check the API key." : ""}`);
  }
  let text: string;
  try {
    text = await readCappedText(response, 4 * 1024 * 1024);
  } catch {
    throw new Error("Listing bigger than 4MB — endpoint unusable.");
  }
  if (text.length === 0) throw new Error(`${url} did not answer with JSON.`);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new Error(`${url} did not answer with JSON.`); }
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error("The endpoint's model listing has no `data` array — enter models by hand or check the wire protocol.");
  const out: DiscoveredModel[] = [];
  for (const raw of data) {
    const entry = raw as { id?: unknown; name?: unknown; display_name?: unknown; context_window?: unknown; context_length?: unknown; max_output_tokens?: unknown; max_tokens?: unknown };
    const id = typeof entry?.id === "string" && entry.id.length > 0 ? entry.id : undefined;
    if (!id) continue;
    const name = typeof entry?.name === "string" ? entry.name : typeof entry?.display_name === "string" ? entry.display_name : undefined;
    const ctxW = typeof entry?.context_window === "number" ? entry.context_window : typeof entry?.context_length === "number" ? entry.context_length : undefined;
    const maxT = typeof entry?.max_output_tokens === "number" ? entry.max_output_tokens : typeof entry?.max_tokens === "number" ? entry.max_tokens : undefined;
    out.push({ id, ...(name ? { name } : {}), ...(ctxW ? { contextWindow: ctxW } : {}), ...(maxT ? { maxTokens: maxT } : {}) });
  }
  return out;
}

/** GET — list the caller's custom providers (masked keys). */
export async function GET() {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  try {
    const rows = await db.customProvider.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        baseURL: r.baseURL,
        api: r.api,
        hasKey: !!r.apiKey,
        maskedKey: r.apiKey ? truncateMask(decryptApiKey(r.apiKey)) : null,
        models: r.models,
      }))
    );
  } catch (error) {
    console.error("GET /api/settings/custom-providers error:", error);
    return NextResponse.json({ error: "Failed to list custom providers" }, { status: 500 });
  }
}

function truncateMask(raw: string): string {
  return raw.length <= 11 ? "***" : `${raw.slice(0, 7)}...${raw.slice(-4)}`;
}

/** POST — add one; discovery must succeed before saving. */
export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  try {
    const body = await parseJsonBody(req);
    const data = createSchema.parse(body);
    const plaintextKey = data.apiKey?.trim() || undefined;

    const models = await discoverModels(data.baseURL, plaintextKey);
    if (models.length === 0) {
      return NextResponse.json({ error: "Discovery found no models on this endpoint." }, { status: 400 });
    }

    const row = await db.customProvider.create({
      data: {
        userId: user.id,
        displayName: data.displayName.trim(),
        baseURL: data.baseURL.trim(),
        api: data.api ?? "openai-completions",
        apiKey: plaintextKey ? encryptApiKey(plaintextKey) : null,
        models: models as never,
      },
    });
    return NextResponse.json({
      id: row.id,
      displayName: row.displayName,
      baseURL: row.baseURL,
      api: row.api,
      hasKey: !!row.apiKey,
      maskedKey: row.apiKey ? truncateMask(plaintextKey!) : null,
      models: row.models,
    }, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    const msg = error instanceof Error ? error.message : "Discovery failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** DELETE — remove one, ownership-fenced. */
export async function DELETE(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });
    const res = await db.customProvider.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/settings/custom-providers error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
