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

/** Honest one-liners for an assistant turn that carried only structured content
 *  (a revision or a constraint) and no prose — a bare "" would otherwise render
 *  as a blank reply bubble (D-104). */
export const REVISION_FALLBACK_TEXT = "Suggested a revision below.";
export const CONSTRAINT_FALLBACK_TEXT = "Proposed a constraint below.";

/** D-157: the turn was nothing but a control-shaped block the parser could not
 *  interpret. The block is stripped so machine syntax never reaches the writer,
 *  which means the raw-text last resort below would re-leak it — say plainly
 *  that nothing came of the turn instead. */
export const STRIPPED_BLOCK_FALLBACK_TEXT =
  "The editor's reply couldn't be read, so nothing was saved from it.";

/** Text to render for one assistant bubble. Prefers the prose message; when the
 *  turn emitted only structured fields (so the prose parses to "") it degrades to
 *  an honest fallback line instead of a blank bubble. "" is treated as "no message"
 *  — a bare `?? content` would let the empty string through (D-104). */
export function assistantBubbleText(content: string): string {
  const parsed = parseDiscussResponse(content); // pure + total: never throws
  const message = parsed.assistantMessage.trim();
  if (message) return message;
  if (parsed.revisedSuggestion) return REVISION_FALLBACK_TEXT;
  if (parsed.suggestedConstraint) return CONSTRAINT_FALLBACK_TEXT;
  // D-157: the parser stripped control-shaped syntax it could not interpret;
  // falling through to `content` would put that syntax straight back on screen.
  if (parsed.strippedControlBlocks?.length) return STRIPPED_BLOCK_FALLBACK_TEXT;
  return content; // no prose and nothing structured — show raw as a last resort
}

export function computeConversationView(input: ConversationViewInput): ConversationView {
  const { replies, findingStatus } = input;
  const userTurns = replies.filter((r) => r.role === "user").length;

  let latestRevision: string | undefined;
  let latestReasoning: string | undefined;
  let latestConstraint: { category: string; content: string } | undefined;
  for (const r of replies) {
    if (r.role !== "assistant") continue;
    const parsed = parseDiscussResponse(r.content); // pure + total: never throws
    if (parsed.revisedSuggestion) {
      // Guard like latestConstraint below: only overwrite when THIS turn actually
      // carries a revision, so a later structured-only or plain turn can't drop an
      // earlier mid-thread revision (and its reasoning) from the view (D-104).
      latestRevision = parsed.revisedSuggestion;
      latestReasoning = parsed.revisedReasoning;
    }
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
