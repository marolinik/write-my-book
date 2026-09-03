import { test, expect, createBookViaApi } from "./fixtures";

/**
 * Local-LLM-overlay E2E: proves a REAL inference round trip through the
 * self-hosted gateway (Anthropic Messages API -> OpenAI translator -> LAN vLLM
 * serving Qwen3.8-Flash-Next), zero provider tokens. Runs only when the dev
 * server and this process share WMB_LLM_FORCE_LOCAL=1; CI (no overlay) skips.
 *
 * Flow: BYOK key stores via gateway-side validation (overlay semantics),
 * ghost-text then streams a genuine model suggestion — the first e2e coverage
 * that exercises the LLM client path end-to-end at all.
 */
const enabled = process.env.WMB_LLM_FORCE_LOCAL === "1";

test.describe("Local gateway LLM round trip", () => {
  test.skip(!enabled, "Requires WMB_LLM_FORCE_LOCAL=1 (local LLM overlay)");

  test("ghost-text returns a real local-model suggestion", async ({
    request,
  }) => {
    // Local inference on the LAN box is honest-slow; keep generous.
    test.setTimeout(240_000);

    // 1) Store the provider key — validation runs against the local gateway.
    const keyRes = await request.post("/api/settings/api-keys", {
      data: {
        provider: "anthropic",
        key: "sk-ant-local-gateway-e2e-not-a-real-key",
        label: "Local Gateway E2E",
      },
    });
    expect([200, 201]).toContain(keyRes.status());

    // 2) Ask ghost-text for a continuation and require model output.
    const book = await createBookViaApi(request, {
      name: "Gateway Ghost Book",
      genre: "Mystery",
    });
    const gt = await request.post(`/api/books/${book.id}/ghost-text`, {
      data: {
        context:
          "The detective opened the drawer and found a letter she had written twenty years ago, addressed to",
        chapterNumber: 1,
      },
    });

    const contentType = gt.headers()["content-type"] ?? "";
    const body = await gt.text();

    if (gt.status() === 422 || gt.status() === 502) {
      // Reasoning-budget outcomes are honest system behaviour, but with the
      // overlay's model this run intends 200 — surface the actual payload.
      throw new Error(
        `ghost-text returned ${gt.status()} (reasoning-only/cut-off): ${body.slice(0, 300)}`
      );
    }

    expect(gt.status()).toBe(200);

    let suggestion = "";
    if (contentType.includes("text/event-stream")) {
      for (const line of body.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const frame = JSON.parse(line.slice(5));
          for (const k of ["token", "text", "delta", "suggestion"] as const) {
            if (typeof frame[k] === "string") suggestion += frame[k];
          }
        } catch {
          /* comment/keepalive frame */
        }
      }
    } else {
      // The local translator is non-streaming; the route's documented
      // non-streaming fallback answers { suggestion, elapsedMs }.
      const json = JSON.parse(body);
      suggestion = typeof json.suggestion === "string" ? json.suggestion : "";
    }

    expect(suggestion.trim().length).toBeGreaterThan(0);
  });
});
