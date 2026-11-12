import { EN } from "@/lib/i18n/ui-strings/en";
import { renderAgentError, type AgentErrorCode, type AgentErrorParams } from "./agent-errors";

export interface AgentErrorFrame {
  type: "error";
  /** English, for logs and clients that predate the codes. */
  content: string;
  metadata: { code: AgentErrorCode; provider?: string } & Record<string, unknown>;
}

/**
 * P2-31: the only way the server builds an agent stream error. The client
 * renders `metadata.code` in the interface language (localizeAgentStreamMessage).
 */
export function agentErrorFrame(
  code: AgentErrorCode,
  params: AgentErrorParams = {},
  extra: Record<string, unknown> = {}
): AgentErrorFrame {
  return {
    type: "error",
    content: renderAgentError(EN, code, params),
    metadata: { code, ...(params.provider ? { provider: params.provider } : {}), ...extra },
  };
}
