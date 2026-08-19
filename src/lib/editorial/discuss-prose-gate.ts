import { controlDelimiterKind } from "./discuss-prompt";

/**
 * D5 (discuss streaming) — the prose gate.
 *
 * WHY A SERVER-SIDE GATE AND NOT A CLIENT-SIDE SANITIZER
 *
 * A discuss reply is prose PLUS machine control blocks the writer must never see
 * (`<<<REVISION>>>` / `<<<REMEMBER category="…">>>` … `<<<END>>>`). The settled
 * view already strips them (D-104) and the D-157 sweep catches the drifted
 * two-closing-bracket variant. But every one of those strippers needs a COMPLETE
 * span: an opener with no terminator yet is deliberately left alone (it reads as
 * prose), which is exactly the state a half-arrived block is in for the whole
 * time it takes the model to finish writing it. Streaming raw deltas to a client
 * that re-runs the settled sanitizer would therefore paint `<<<REMEMBER
 * category="preference">>` on screen for seconds and then retract it — the
 * dishonest direction, and a guaranteed leak rather than a hypothetical one.
 *
 * So the server emits only text it can PROVE the settled parser keeps:
 *
 *  1. A COMPLETE line is classified with {@link controlDelimiterKind} — the same
 *     recognizer the settled sweep uses, whose net is strictly wider than the
 *     strict block regexes. An opener suppresses output until its terminator; the
 *     delimiters themselves and the body between them are never emitted.
 *  2. An INCOMPLETE (still-arriving) line may only be emitted when it cannot
 *     still become a delimiter. Both delimiter regexes are anchored at `^<`, so
 *     the test is simply "the first non-whitespace character exists and is not
 *     `<`". Whitespace-only and `<`-leading partials are held until the newline
 *     resolves them, then flushed if they turned out to be prose.
 *
 * Consequences, deliberate and disclosed:
 *  - The streamed text is always a SUBSET of the settled prose (the `done` frame
 *    carries the canonical parse, so the swap can only ADD text, never retract
 *    machine syntax).
 *  - Prose lines that happen to start with `<` arrive one line late.
 *  - Control syntax that the model writes INLINE (mid-line) is out of scope: the
 *    settled parser is line-anchored too, so it renders such a line as prose
 *    either way. Streaming it is not a new leak — it is the pre-existing D-157
 *    family boundary, recorded in the fix review rather than papered over here.
 *
 * Stateful by nature (it spans chunk boundaries), but it never mutates its input
 * and each `push` returns a fresh string.
 */
export interface DiscussProseGate {
  /**
   * Feed one provider text delta. Returns the prose-safe text to emit now —
   * often `""` while a line is still ambiguous or a control block is open.
   */
  push(delta: string): string;
}

/** True when this partial line can no longer become a control delimiter. */
function partialIsProvablyProse(partial: string): boolean {
  const firstNonSpace = partial.trimStart();
  return firstNonSpace.length > 0 && !firstNonSpace.startsWith("<");
}

export function createDiscussProseGate(): DiscussProseGate {
  /** The current, not-yet-newline-terminated line. */
  let line = "";
  /** How much of `line` has already been emitted (never re-emitted). */
  let emitted = 0;
  /** Inside a control block: an opener was seen, its terminator has not. */
  let inBlock = false;

  return {
    push(delta: string): string {
      if (!delta) return "";
      line += delta;
      let out = "";

      for (let nl = line.indexOf("\n"); nl !== -1; nl = line.indexOf("\n")) {
        const whole = line.slice(0, nl);
        const kind = controlDelimiterKind(whole);
        if (kind === "end") {
          inBlock = false;
        } else if (kind === "open") {
          inBlock = true;
        } else if (!inBlock) {
          // Prose: emit whatever of this line has not gone out yet, plus the
          // newline that terminated it.
          out += whole.slice(emitted) + "\n";
        }
        line = line.slice(nl + 1);
        emitted = 0;
      }

      // Trailing partial line. Emitting it early is what gives the writer a
      // token-by-token feel; it is only safe once the line cannot be a
      // delimiter. (If we get here with emitted > 0, the line already proved
      // itself prose, so the complete-line branch above can never reclassify
      // it as control syntax.)
      if (!inBlock && partialIsProvablyProse(line)) {
        out += line.slice(emitted);
        emitted = line.length;
      }
      return out;
    },
  };
}
