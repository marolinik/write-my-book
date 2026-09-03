import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { checkQuota } from "@/lib/billing/quota-checker";
import { recordDailyUse } from "@/lib/billing/free-tier-meters";
import { createLLMClient, resolveProviderRoute, resolveQuickAssistModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import {
  withQuickAssistReasoning,
  settleQuickAssist,
  MODEL_NO_QUICK_SUGGEST_CODE,
  modelNoQuickSuggestMessage,
  QUICK_ASSIST_TIMEOUT_MS,
} from "@/lib/llm/quick-assist";
import {
  gateQuickAssistStream,
  sseQuickAssistBody,
  type GateResult,
} from "@/lib/llm/quick-assist-stream";
import { QUICK_ASSIST_SSE_HEADERS } from "@/lib/api/sse-quick-assist";
import { ghostTextRequestSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/ghost-text — get a short AI continuation for the text before the cursor. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    // D5 warmup ping: JIT-compile this route module on editor mount without
    // touching the LLM, quota, or DB. Placed AFTER requireUser (still authed —
    // no anon probe) but BEFORE parse/quota/key-load/LLM so it never bills and
    // never writes. Fired fire-and-forget on mount; best-effort in multi-
    // instance prod (the honest cold-start story is the measured Server-Timing,
    // not a claim that warmup eliminates cold start — spec §7). Read from
    // req.url (works for a plain Request in tests, unlike req.nextUrl).
    if (new URL(req.url).searchParams.get("warmup") === "1") {
      return NextResponse.json({ warmed: true }, { status: 200 });
    }

    const body = await parseJsonBody(req);
    const data = ghostTextRequestSchema.parse(body);

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, language: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check usage quota (free-tier daily ghost-text meter + word/session caps)
    const quotaResult = await checkQuota(user.id, "ghost_text");
    if (!quotaResult.allowed) {
      return NextResponse.json(
        {
          error: quotaResult.reason,
          upgradeToTier: quotaResult.upgradeToTier,
          remainingToday: quotaResult.remainingToday,
        },
        { status: 429 }
      );
    }

    // Resolve the quick-assist model for the user's preferred provider via the
    // registry (BYOK — no platform key fallbacks). This routes AROUND models
    // flagged unfitForQuickAssist (D-116/D-117): the seeded openrouter-qwen36/*
    // reasoning default's own "/haiku" slot is the SAME reasoning model, which
    // burns the 60-token budget on thinking and returns no text — so we
    // substitute the cheapest non-reasoning haiku from the same provider
    // (DeepSeek V3.2 for OpenRouter). Unflagged models are unchanged.
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { defaultModel: true },
    });
    const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
    const cheapModel = resolveQuickAssistModelFor(userDefault);

    // Load all user keys (no platform key fallbacks)
    const userKeys = await db.apiKey.findMany({
      where: { userId: user.id, validatedAt: { not: null } },
      select: { provider: true, encryptedKey: true },
    });
    const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
    for (const k of userKeys) {
      decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
    }

    const route = resolveProviderRoute(cheapModel.provider as ProviderKey, {
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });
    if (route.route === "none") {
      return NextResponse.json(
        { error: `No API key configured for ghost text. Add one in Settings > API Keys.` },
        { status: 400 }
      );
    }

    const { client, model } = createLLMClient({
      modelId: cheapModel.id,
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });

    // Build the prompt
    const lang = book.language || "en";
    const langInstruction =
      lang !== "en"
        ? `\nIMPORTANT: Continue in the same language as the original text (${lang}). Do NOT translate.`
        : "";

    const systemPrompt = `Continue this fiction prose in the author's voice; at most one sentence.

Rules:
- Respond with ONLY the continuation text — no quotes, no explanation, no markdown
- Pick up exactly where the text leaves off (continue mid-sentence if the text stops mid-sentence)
- Match the style, tone, and tense of the surrounding prose
- Never use AI-tell phrases: "delve", "tapestry", "testament to", "palpable", "a dance of", "sending shivers"${langInstruction}`;

    // D-100: on the OpenRouter route (where the seeded free-tier default
    // qwen/qwen3.6-27b lives), disable provider reasoning so the tiny 60-token
    // budget isn't burned entirely on thinking blocks. `reasoning` is an
    // OpenRouter parameter — never sent on the direct Anthropic route, which
    // rejects the unknown field (Anthropic gates thinking via `thinking`).
    // The WMB local-LLM translator (provider "local") speaks the same
    // directive and maps it to its upstream's "none" effort — the local
    // generalist IS a reasoning model and would otherwise starve the budget.
    const localTranslator = model.provider === "local";
    const baseParams = {
      model: model.modelId,
      max_tokens: 60,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: data.context }],
    };
    const streamBody =
      route.route === "openrouter" || localTranslator
        ? withQuickAssistReasoning(baseParams)
        : baseParams;

    const startedAt = Date.now();

    // D5 fallback (constraint #5 / spec §5): degrade to today's EXACT
    // non-streaming create() path when the provider route can't stream. Worst
    // case across all 5 BYOK routes = byte-identical to today's JSON response.
    // D-142: threads req.signal + a bounded timeout here too, and a client
    // abort returns 499 without billing.
    const respondNonStreaming = async (): Promise<Response> => {
      let response;
      try {
        response = await client.messages.create(streamBody, {
          signal: req.signal,
          timeout: QUICK_ASSIST_TIMEOUT_MS,
        });
      } catch (err) {
        if (req.signal.aborted || (err as Error)?.name === "AbortError") {
          return new Response(null, { status: 499 });
        }
        throw err;
      }
      if (req.signal.aborted) return new Response(null, { status: 499 });

      const ms = Date.now() - startedAt;
      const timing = { "Server-Timing": `llm;dur=${ms}` };
      const settle = settleQuickAssist(response.content, response.stop_reason);
      if (settle.kind === "reasoning-only") {
        return NextResponse.json(
          {
            error: modelNoQuickSuggestMessage("ghost-text"),
            code: MODEL_NO_QUICK_SUGGEST_CODE,
          },
          { status: 422, headers: timing }
        );
      }
      if (settle.kind === "empty") {
        return NextResponse.json(
          {
            error: settle.truncated
              ? "The suggestion was cut off before any text was produced. Please try again."
              : "No suggestion was generated. Please try again.",
            retryable: true,
          },
          { status: 502, headers: timing }
        );
      }

      // Genuine, non-empty result — record usage with the registry ID, then
      // advance the Free-tier meter (D-36: increment-on-success only).
      const cost = estimateCost(
        model.id,
        response.usage.input_tokens,
        response.usage.output_tokens
      );
      await db.usageRecord.create({
        data: {
          userId: user.id,
          bookId,
          agentType: "ghost-text",
          model: model.id,
          tokensInput: response.usage.input_tokens,
          tokensOutput: response.usage.output_tokens,
          costEstimate: cost,
        },
      });
      if (quotaResult.isFree) {
        await recordDailyUse(user.id, "ghost");
      }
      return NextResponse.json(
        { suggestion: settle.text, elapsedMs: ms },
        { headers: timing }
      );
    };

    // D5 first-text-gate: consume the provider stream SERVER-SIDE and hold the
    // HTTP status until the first real text delta. reasoning-only / cut-off
    // return the EXISTING 422/502 JSON verbatim BEFORE any byte flushes; on
    // first text we return 200 text/event-stream and pump token+done frames
    // (billing happens at settle inside sseQuickAssistBody).
    let gate: GateResult;
    let mstream: ReturnType<typeof client.messages.stream>;
    try {
      mstream = client.messages.stream(streamBody, {
        signal: req.signal,
        timeout: QUICK_ASSIST_TIMEOUT_MS,
      });
      gate = await gateQuickAssistStream(mstream, req.signal);
    } catch (streamErr) {
      // D-142: an abort here is the client leaving pre-first-token — no bill.
      if (req.signal.aborted || (streamErr as Error)?.name === "AbortError") {
        return new Response(null, { status: 499 });
      }
      // Stream unsupported at connect (LiteLLM-proxy risk) — degrade to create().
      return await respondNonStreaming();
    }

    // D-142: client bailed before the first token — cancel upstream, do NOT
    // bill (see the billing decision table in quick-assist-stream.ts).
    if (req.signal.aborted) {
      mstream.abort();
      return new Response(null, { status: 499 });
    }

    if (!gate.ok) {
      const ms = Date.now() - startedAt;
      const timing = { "Server-Timing": `llm;dur=${ms}` };
      if (gate.reasoningOnly) {
        return NextResponse.json(
          {
            error: modelNoQuickSuggestMessage("ghost-text"),
            code: MODEL_NO_QUICK_SUGGEST_CODE,
          },
          { status: 422, headers: timing }
        );
      }
      return NextResponse.json(
        {
          error: gate.truncated
            ? "The suggestion was cut off before any text was produced. Please try again."
            : "No suggestion was generated. Please try again.",
          retryable: true,
        },
        { status: 502, headers: timing }
      );
    }

    return new Response(
      sseQuickAssistBody(gate.gated, req.signal, {
        userId: user.id,
        bookId,
        model,
        isFree: quotaResult.isFree ?? false,
        startedAt,
      }),
      {
        status: 200,
        headers: {
          ...QUICK_ASSIST_SSE_HEADERS,
          "Server-Timing": `ttft;dur=${Date.now() - startedAt}`,
        },
      }
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
    console.error("POST /api/books/:id/ghost-text error:", (error as Error).message);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
