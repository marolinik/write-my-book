/**
 * D-176 / D-178 — one honest line for a discuss turn that did not land.
 *
 * `ConversationInput` used to swallow every rejection and keep the text in the
 * box; the thread said nothing at all, so a failed turn was a silent wall
 * (D-129 family). Now the composer clears the moment the message is handed off
 * (D-178), which makes silence unacceptable — the writer would watch their
 * sentence disappear with no bubble and no explanation. Every rejection path
 * (cancel, rate limit, provider drop, settle failure) maps through here.
 */

/** Thrown by the discussion hook when the WRITER aborted the turn. */
export const DISCUSS_TURN_CANCELLED = "discuss_turn_cancelled";
/** Historical sentinel thrown on a 429 from the discuss route. */
export const DISCUSS_RATE_LIMITED = "rate_limited";

export interface DiscussTurnNotice {
  /** `muted` = an outcome the writer chose; `error` = something went wrong. */
  tone: "muted" | "error";
  text: string;
}

const CANCELLED_TEXT =
  "Turn cancelled — nothing was saved, and none of your 3 exchanges were used.";
const RATE_LIMITED_TEXT =
  "You've reached today's limit for discussing findings. Please try again tomorrow.";
const UNKNOWN_TEXT =
  "That turn didn't go through. Your message is back in the box — please try again.";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  return "";
}

export function discussTurnNotice(error: unknown): DiscussTurnNotice {
  const message = messageOf(error);
  if (message === DISCUSS_TURN_CANCELLED) return { tone: "muted", text: CANCELLED_TEXT };
  if (message === DISCUSS_RATE_LIMITED) return { tone: "error", text: RATE_LIMITED_TEXT };
  // Every other message on this path is server-authored writer-facing copy
  // (discuss-stream.ts INTERRUPTED/SETTLE_FAILED, discuss-stream-client.ts
  // truncation) — pass it through rather than paraphrase it.
  if (message) return { tone: "error", text: message };
  return { tone: "error", text: UNKNOWN_TEXT };
}
