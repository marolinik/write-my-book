import { parseDiscussResponse } from "./discuss-prompt";

export type Resolution = "pending" | "capped" | "applied" | "dismissed";

export interface StoredReply {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationViewInput {
  replies: StoredReply[];
  findingStatus: string; // "pending" | "applied" | "dismissed" | ...
}

export interface ConversationView {
  userTurns: number;
  canDiscuss: boolean;
  latestRevision?: string;
  latestReasoning?: string;
  latestConstraint?: { category: string; content: string };
  resolution: Resolution;
}

export const MAX_USER_TURNS = 3;

export function computeConversationView(input: ConversationViewInput): ConversationView {
  const { replies, findingStatus } = input;
  const userTurns = replies.filter((r) => r.role === "user").length;

  let latestRevision: string | undefined;
  let latestReasoning: string | undefined;
  let latestConstraint: { category: string; content: string } | undefined;
  for (const r of replies) {
    if (r.role !== "assistant") continue;
    const parsed = parseDiscussResponse(r.content); // pure + total: never throws
    latestRevision = parsed.revisedSuggestion; // reset each assistant turn
    latestReasoning = parsed.revisedReasoning;
    if (parsed.suggestedConstraint) latestConstraint = parsed.suggestedConstraint;
  }

  let resolution: Resolution;
  if (findingStatus === "applied") resolution = "applied";
  else if (findingStatus === "dismissed") resolution = "dismissed";
  else if (userTurns >= MAX_USER_TURNS) resolution = "capped";
  else resolution = "pending";

  const canDiscuss = resolution === "pending";
  return { userTurns, canDiscuss, latestRevision, latestReasoning, latestConstraint, resolution };
}
