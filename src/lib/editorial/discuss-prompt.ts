export const MEMORY_CATEGORIES = ["style", "name", "preference", "constraint", "correction"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DiscussFinding {
  category: string;
  severity: string;
  description: string;
  rationale?: string | null;
  anchorQuote?: string | null;
  alternatives?: Array<{ label?: string; originalText?: string; newText?: string }>;
}

export interface DiscussPromptInput {
  finding: DiscussFinding;
  priorTurns: ThreadTurn[];
  writerMessage: string;
  writerMemoryBlock: string; // output of formatWriterMemoryForPrompt (may be "")
  agentType?: string;
}

export interface ParsedDiscussTurn {
  assistantMessage: string;
  revisedSuggestion?: string;
  revisedReasoning?: string;
  suggestedConstraint?: { category: MemoryCategory; content: string };
  /** D-157: verbs of control-shaped blocks the strict parses declined but the
   *  post-parse sweep removed from the display prose. Present only when
   *  something was stripped, so callers can render honest copy instead of a
   *  blank (or raw) bubble. Verbs only — never the block's raw syntax. */
  strippedControlBlocks?: readonly string[];
}

export function buildDiscussPrompt(input: DiscussPromptInput): { system: string; user: string } {
  const { finding, priorTurns, writerMessage, writerMemoryBlock, agentType } = input;
  const current = finding.alternatives?.[0]?.newText ?? "";
  const system =
    `You are the ${agentType ?? "editor"} collaborating with the writer on ONE finding you flagged:\n` +
    `"${finding.description}"${finding.rationale ? ` (why it matters: ${finding.rationale})` : ""}.\n` +
    `Category: ${finding.category}. Severity: ${finding.severity}.\n` +
    `The writer is explaining their intent. Adapt: propose a revised suggestion, or agree to keep their text. ` +
    `Be brief and concrete. Never lecture.\n\n` +
    `If you propose a revision, append a block on its own lines:\n` +
    `<<<REVISION>>>\nsuggestion: <the revised replacement text>\nwhy: <one line>\n<<<END>>>\n\n` +
    `If (and only if) the writer defends an intentional choice you accept, append:\n` +
    `<<<REMEMBER category="preference">>>\n<one concise preference, imperative voice>\n<<<END>>>\n` +
    `Use a category from: ${MEMORY_CATEGORIES.join(", ")}. Do NOT specify a book or scope.\n` +
    writerMemoryBlock;

  const anchor = finding.anchorQuote ? `\nAnchor text: ${finding.anchorQuote}` : "";
  const currentSuggestion = current ? `\nYour current suggestion: ${current}` : "";
  const thread = priorTurns.map((t) => `${t.role === "user" ? "Writer" : "You"}: ${t.content}`).join("\n");
  const user =
    `Finding under discussion.${anchor}${currentSuggestion}\n\n` +
    (thread ? `Conversation so far:\n${thread}\n\n` : "") +
    `Writer: ${writerMessage}`;

  return { system, user };
}

/** D-157: the model writes these delimiters, and it intermittently drifts on the
 *  bracket count (`<<<REMEMBER category="preference">>` with TWO closing
 *  brackets was observed on 2 of 3 live turns). An exact `<<<`/`>>>` match let
 *  the whole block bypass the parser, which both leaked raw machine syntax into
 *  the writer's bubble and silently dropped the constraint the reply promised to
 *  remember. Tolerate 2–4 brackets on either side instead. */
const OPEN_BRACKETS = "<{2,4}";
const CLOSE_BRACKETS = ">{2,4}";
const REVISION_OPEN_RE = new RegExp(`^${OPEN_BRACKETS}REVISION${CLOSE_BRACKETS}$`);
const REMEMBER_OPEN_RE = new RegExp(`^${OPEN_BRACKETS}REMEMBER(\\s+category="[^"]*")?${CLOSE_BRACKETS}$`);
const BLOCK_END_RE = new RegExp(`^${OPEN_BRACKETS}END${CLOSE_BRACKETS}$`);

/** Deliberately wider than the strict block regexes above: any line whose whole
 *  content looks like a machine delimiter (`<<VERB …>>`, attributes optional,
 *  bracket count loose). This is the net the post-parse sweep casts so no
 *  control syntax can reach the writer even when the strict parse declined the
 *  block (D-157). */
const CONTROL_OPEN_RE = /^<{2,4}\s*([A-Z][A-Z0-9_]*)\b(?:[^<>]*)>{1,4}$/;
const CONTROL_END_RE = /^<{1,4}\s*END\s*>{1,4}$/;
const CATEGORY_ATTR_RE = /category="?([^"\s>]*)"?/;

/** Matches a delimiter only when it is the sole content of a line (optional surrounding whitespace). */
function blockLineIndex(lines: readonly string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i].trim())) return i;
  return -1;
}

function coerceMemoryCategory(raw: string | undefined): MemoryCategory {
  const candidate = (raw ?? "constraint").trim().toLowerCase();
  if ((MEMORY_CATEGORIES as readonly string[]).includes(candidate)) return candidate as MemoryCategory;
  console.warn("[discuss] coerced invalid memory category:", candidate);
  return "constraint";
}

/** Builds a constraint from a REMEMBER header line plus its body lines. An empty
 *  body yields undefined — there is nothing to remember, so the caller strips
 *  the block rather than persisting a blank preference. */
function readConstraint(
  header: string,
  body: readonly string[]
): { category: MemoryCategory; content: string } | undefined {
  const content = body.join("\n").trim();
  if (!content) return undefined;
  return { category: coerceMemoryCategory(header.match(CATEGORY_ATTR_RE)?.[1]), content };
}

interface ControlSweep {
  readonly consumed: ReadonlySet<number>;
  readonly constraint?: { category: MemoryCategory; content: string };
  readonly strippedVerbs: readonly string[];
}

function findUnconsumedEnd(lines: readonly string[], consumed: ReadonlySet<number>, from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    if (CONTROL_END_RE.test(lines[i].trim())) return i;
  }
  return -1;
}

/** Belt-and-braces pass (D-157). Whatever the strict block parses left behind, a
 *  COMPLETE control-shaped span (delimiter line + terminator line) is machine
 *  syntax and must never render as the writer's prose. A recognizable REMEMBER
 *  still yields its constraint, so a stated preference is persisted rather than
 *  silently dropped; every other stripped span is reported and logged, never
 *  discarded without a trace. Incomplete spans are left untouched so a stray or
 *  unclosed delimiter still reads as the prose it is (D-104 sibling behavior). */
function sweepUnparsedControlBlocks(
  lines: readonly string[],
  alreadyConsumed: ReadonlySet<number>
): ControlSweep {
  const consumed = new Set(alreadyConsumed);
  const strippedVerbs: string[] = [];
  let constraint: { category: MemoryCategory; content: string } | undefined;

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const header = lines[i].trim();
    const open = header.match(CONTROL_OPEN_RE);
    if (!open || open[1] === "END") continue;

    const end = findUnconsumedEnd(lines, consumed, i + 1);
    if (end === -1) continue; // unclosed → not a block; leave the prose intact

    const verb = open[1];
    const body = lines.slice(i + 1, end);
    const recovered = verb === "REMEMBER" ? readConstraint(header, body) : undefined;
    if (recovered && !constraint) {
      constraint = recovered;
    } else {
      console.warn(
        `[discuss] stripped unparsed control block from reply prose: verb=${verb} bodyLines=${body.length}` +
          ` recovered=${recovered ? "duplicate-remember" : "none"}`
      );
    }
    strippedVerbs.push(verb);
    for (let k = i; k <= end; k++) consumed.add(k);
    i = end;
  }

  return { consumed, constraint, strippedVerbs };
}

export function parseDiscussResponse(text: string): ParsedDiscussTurn {
  const lines = text.split(/\r?\n/);

  let revisedSuggestion: string | undefined;
  let revisedReasoning: string | undefined;
  let suggestedConstraint: { category: MemoryCategory; content: string } | undefined;
  const consumed = new Set<number>();

  // REVISION block
  const revStart = blockLineIndex(lines, REVISION_OPEN_RE);
  if (revStart !== -1) {
    const revEnd = blockLineIndex(lines, BLOCK_END_RE, revStart + 1);
    if (revEnd !== -1) {
      const body = lines.slice(revStart + 1, revEnd);
      for (const raw of body) {
        const m = raw.match(/^\s*(suggestion|why):\s*(.*)$/i);
        if (m && m[1].toLowerCase() === "suggestion") revisedSuggestion = m[2].trim();
        if (m && m[1].toLowerCase() === "why") revisedReasoning = m[2].trim();
      }
      if (revisedSuggestion) for (let i = revStart; i <= revEnd; i++) consumed.add(i);
      else revisedSuggestion = revisedReasoning = undefined; // malformed → drop, keep prose
    }
  }

  // REMEMBER block
  const remStart = blockLineIndex(lines, REMEMBER_OPEN_RE);
  if (remStart !== -1) {
    const remEnd = blockLineIndex(lines, BLOCK_END_RE, remStart + 1);
    if (remEnd !== -1) {
      const parsed = readConstraint(lines[remStart].trim(), lines.slice(remStart + 1, remEnd));
      if (parsed) {
        suggestedConstraint = parsed;
        for (let i = remStart; i <= remEnd; i++) consumed.add(i);
      }
    }
  }

  // D-157 belt-and-braces: nothing control-shaped may survive into the writer's
  // bubble, and a REMEMBER the strict pass missed must still reach writer memory.
  const swept = sweepUnparsedControlBlocks(lines, consumed);
  const assistantMessage = lines.filter((_, i) => !swept.consumed.has(i)).join("\n").trim();
  return {
    assistantMessage,
    revisedSuggestion,
    revisedReasoning,
    suggestedConstraint: suggestedConstraint ?? swept.constraint,
    ...(swept.strippedVerbs.length > 0 ? { strippedControlBlocks: swept.strippedVerbs } : {}),
  };
}
