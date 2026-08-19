import { readSseFrames } from "@/lib/api/sse-frames-client";

/**
 * D5 — the client half of a streamed discuss turn.
 *
 * Pure state machine (no React): it pushes prose deltas at the caller as they
 * land, then resolves with the SAME settled payload the blocking 200 used to
 * return — plus `raw`, the persisted reply, so the thread can swap its streamed
 * text for the identical render a reload produces.
 *
 * Terminal-frame mapping preserves the historical HTTP outcomes exactly:
 *  - `done`                → the settled turn;
 *  - `error` with 409      → a capped result, NOT an error (the blocking route's
 *                            409 body was also consumed as data, never thrown);
 *  - any other `error`     → thrown with the server's own message;
 *  - stream ends with none → thrown, so the optimistic writer turn rolls back
 *                            instead of hanging a permanent spinner.
 */

export interface DiscussTurnResult {
  assistantMessage?: string;
  revisedSuggestion?: string;
  revisedReasoning?: string;
  suggestedConstraint?: { category: string; content: string };
  strippedControlBlocks?: string[];
  /** The raw reply as persisted — rendered through the settled sanitizer. */
  raw?: string;
  userTurns: number;
  capped: boolean;
  /** Server-measured turn latency, present on a streamed done frame. */
  elapsedMs?: number;
}

export interface ConsumeDiscussStreamOptions {
  /** Called with each prose-safe delta, in order. */
  onText: (delta: string) => void;
  signal?: AbortSignal;
}

const NO_BODY_MESSAGE = "The editor's reply could not be read. Please try again.";
const TRUNCATED_MESSAGE =
  "The editor's reply was cut off before it finished. Your discussion turn was not used — please try again.";

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Narrow the settled constraint, which the chip and the dismiss promise read. */
function asConstraint(value: unknown): { category: string; content: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { category, content } = value as { category?: unknown; content?: unknown };
  if (typeof category !== "string" || typeof content !== "string") return undefined;
  return { category, content };
}

function asTextList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export async function consumeDiscussStream(
  res: Response,
  { onText, signal }: ConsumeDiscussStreamOptions
): Promise<DiscussTurnResult> {
  if (!res.body) throw new Error(NO_BODY_MESSAGE);

  for await (const frame of readSseFrames(res, signal)) {
    if (frame.type === "text") {
      const delta = typeof frame.text === "string" ? frame.text : "";
      if (delta.length > 0) onText(delta);
      continue;
    }
    if (frame.type === "done") {
      // Narrowed field by field: this crosses a network boundary, so nothing is
      // trusted into the render tree on shape alone.
      return {
        assistantMessage: asText(frame.assistantMessage),
        revisedSuggestion: asText(frame.revisedSuggestion),
        revisedReasoning: asText(frame.revisedReasoning),
        suggestedConstraint: asConstraint(frame.suggestedConstraint),
        strippedControlBlocks: asTextList(frame.strippedControlBlocks),
        raw: asText(frame.raw),
        userTurns: asNumber(frame.userTurns),
        capped: false,
        elapsedMs: typeof frame.elapsedMs === "number" ? frame.elapsedMs : undefined,
      };
    }
    if (frame.type === "error") {
      if (frame.status === 409) {
        return {
          capped: true,
          userTurns: asNumber(frame.userTurns),
          assistantMessage: asText(frame.assistantMessage),
        };
      }
      throw new Error(typeof frame.error === "string" ? frame.error : TRUNCATED_MESSAGE);
    }
  }

  // Connection dropped mid-turn with no terminal frame: nothing was persisted
  // server-side either, so surfacing an error is the honest outcome.
  throw new Error(TRUNCATED_MESSAGE);
}
