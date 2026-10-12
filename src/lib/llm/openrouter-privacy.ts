type Fetch = typeof fetch;

/**
 * A fetch for OpenRouter that asks for providers which neither store nor
 * train on prompts: every JSON request body gets
 * `provider.data_collection = "deny"`. Other provider preferences are kept;
 * deny always wins. Requests without a JSON body pass through untouched.
 *
 * Verified live 2026-10-12: the Anthropic-compatible /api/v1/messages endpoint
 * accepts the field and still serves deepseek/deepseek-v4.1-flash.
 */
export function withOpenRouterPrivacy(base: Fetch = fetch): Fetch {
  return (input, init) => base(input, privateInit(init));
}

function privateInit(init: RequestInit | undefined): RequestInit | undefined {
  if (!init || typeof init.body !== "string") return init;
  let body: unknown;
  try {
    body = JSON.parse(init.body);
  } catch {
    return init;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return init;
  const current = body as Record<string, unknown>;
  const provider =
    current.provider && typeof current.provider === "object" ? (current.provider as Record<string, unknown>) : {};
  return {
    ...init,
    body: JSON.stringify({ ...current, provider: { ...provider, data_collection: "deny" } }),
  };
}
