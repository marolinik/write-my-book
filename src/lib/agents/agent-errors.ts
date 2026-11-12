import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import type { AgentStreamMessage } from "@/lib/agents/types";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

/**
 * P2-31: the stable codes an agent stream failure carries. The server puts
 * one in `metadata.code` (with the provider when there is one); the client
 * renders `t.agentErrors[code]` in the interface language. The frame's
 * `content` is the English sentence, kept for logs and old clients.
 */
export const AGENT_ERROR_CODES = [
  "PROVIDER_KEY_INVALID",
  "PROVIDER_NO_CREDIT",
  "PROVIDER_FORBIDDEN",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_MODEL_NOT_ALLOWED",
  "PROVIDER_RETRYING",
  "NO_PROVIDER_KEY",
  "DIRECT_KEY_UNSUPPORTED",
  "EMPTY_RESPONSE",
  "SESSION_FAILED",
  "SESSION_CANCELLED",
  "SESSION_NOT_FOUND",
  "STREAM_UNAVAILABLE",
  "WORKER_ABSENT",
  "BACKGROUND_FAILED",
  "WORKER_RESTARTED",
] as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

/** The codes translateProviderError can answer with. */
export type ProviderErrorCode = Extract<AgentErrorCode, `PROVIDER_${string}`>;

const CODES: ReadonlySet<string> = new Set(AGENT_ERROR_CODES);

export function isAgentErrorCode(value: unknown): value is AgentErrorCode {
  return typeof value === "string" && CODES.has(value);
}

export interface AgentErrorParams {
  /** An LLMProvider id ("openrouter", "local", ...). */
  provider?: string;
}

/** Product names are not translated; the self-hosted fleet is a description. */
const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  gemini: "Google Gemini",
  grok: "xAI Grok",
};

function providerName(t: UIStrings, provider: string | undefined): string {
  if (!provider || provider === "local") return t.agentErrors.localFleet;
  return PROVIDER_NAMES[provider] ?? provider;
}

export function renderAgentError(t: UIStrings, code: AgentErrorCode, params: AgentErrorParams = {}): string {
  return t.agentErrors[code].replace("{provider}", providerName(t, params.provider));
}

function numberParam(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "?";
}

/**
 * The stream message as the writer should read it: a coded error or retry
 * status rendered in the interface language, anything else unchanged.
 */
export function localizeAgentStreamMessage<M extends AgentStreamMessage>(
  message: M,
  t: UIStrings,
  language: string
): M {
  const meta = message.metadata ?? {};
  const code = meta.code;
  if (!isAgentErrorCode(code)) return message;
  const provider = typeof meta.provider === "string" ? meta.provider : undefined;
  let content = renderAgentError(t, code, { provider });
  if (message.type === "status" && code === "PROVIDER_RETRYING") {
    const retry = getAgentStrings(language)
      .statusRetrying.replace("{seconds}", numberParam(meta.retryInSeconds))
      .replace("{attempt}", numberParam(meta.attempt))
      .replace("{max}", numberParam(meta.max));
    content = `${content} ${retry}`;
  }
  return { ...message, content };
}
