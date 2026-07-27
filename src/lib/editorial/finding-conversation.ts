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

/** Structured fields carried by a thread, latest-wins per field. */
export interface LatestStructuredFields {
  latestRevision?: string;
  latestReasoning?: string;
  latestConstraint?: { category: string; content: string };
}

/**
 * Scan a thread (oldest → newest) and keep, per field, the value from whichever
 * assistant turn last carried it. A later structured-only or plain turn can
 * never drop an earlier turn's revision or constraint from view (D-104).
 *
 * D-170: this is the SINGLE source of truth for "which constraint does this
 * thread carry". Both the chip the writer reads (via computeConversationView)
 * and the dismiss route that persists the WriterMemory row select through here,
 * so the promise and the persistence cannot diverge. Total + pure:
 * parseDiscussResponse never throws, so a corrupted row is skipped, not fatal.
 */
export function selectLatestStructuredFields(
  replies: readonly StoredReply[]
): LatestStructuredFields {
  let latestRevision: string | undefined;
  let latestReasoning: string | undefined;
  let latestConstraint: { category: string; content: string } | undefined;
  for (const r of replies) {
    if (r.role !== "assistant") continue;
    const parsed = parseDiscussResponse(r.content); // pure + total: never throws
    if (parsed.revisedSuggestion) {
      latestRevision = parsed.revisedSuggestion;
      latestReasoning = parsed.revisedReasoning;
    }
    if (parsed.suggestedConstraint) latestConstraint = parsed.suggestedConstraint;
  }
  return { latestRevision, latestReasoning, latestConstraint };
}

/**
 * The constraint a "Keep as-is" must persist — exactly the one the chip
 * promises. Server-side callers pass the finding's assistant replies in
 * createdAt-ascending order (D-170).
 */
export function selectLatestConstraint(
  replies: readonly StoredReply[]
): { category: string; content: string } | undefined {
  return selectLatestStructuredFields(replies).latestConstraint;
}

export function computeConversationView(input: ConversationViewInput): ConversationView {
  const { replies, findingStatus } = input;
  const userTurns = replies.filter((r) => r.role === "user").length;

  const { latestRevision, latestReasoning, latestConstraint } =
    selectLatestStructuredFields(replies);

  let resolution: Resolution;
  if (findingStatus === "applied") resolution = "applied";
  else if (findingStatus === "dismissed") resolution = "dismissed";
  else if (userTurns >= MAX_USER_TURNS) resolution = "capped";
  else resolution = "pending";

  const canDiscuss = resolution === "pending";
  return { userTurns, canDiscuss, latestRevision, latestReasoning, latestConstraint, resolution };
}
