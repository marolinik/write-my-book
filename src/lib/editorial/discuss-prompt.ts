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

/** Matches a delimiter only when it is the sole content of a line (optional surrounding whitespace). */
function blockLineIndex(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i].trim())) return i;
  return -1;
}

export function parseDiscussResponse(text: string): ParsedDiscussTurn {
  const lines = text.split(/\r?\n/);

  let revisedSuggestion: string | undefined;
  let revisedReasoning: string | undefined;
  let suggestedConstraint: { category: MemoryCategory; content: string } | undefined;
  const consumed = new Set<number>();

  // REVISION block
  const revStart = blockLineIndex(lines, /^<<<REVISION>>>$/);
  if (revStart !== -1) {
    const revEnd = blockLineIndex(lines, /^<<<END>>>$/, revStart + 1);
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
  const remStart = blockLineIndex(lines, /^<<<REMEMBER(\s+category="[^"]*")?>>>$/);
  if (remStart !== -1) {
    const remEnd = blockLineIndex(lines, /^<<<END>>>$/, remStart + 1);
    if (remEnd !== -1) {
      const header = lines[remStart].trim();
      const catMatch = header.match(/category="([^"]*)"/);
      const rawCat = (catMatch?.[1] ?? "constraint").toLowerCase();
      const category = (MEMORY_CATEGORIES as readonly string[]).includes(rawCat)
        ? (rawCat as MemoryCategory)
        : "constraint";
      if (!(MEMORY_CATEGORIES as readonly string[]).includes(rawCat)) {
        console.warn("[discuss] coerced invalid memory category:", rawCat);
      }
      const content = lines.slice(remStart + 1, remEnd).join("\n").trim();
      if (content) {
        suggestedConstraint = { category, content };
        for (let i = remStart; i <= remEnd; i++) consumed.add(i);
      }
    }
  }

  const assistantMessage = lines.filter((_, i) => !consumed.has(i)).join("\n").trim();
  return { assistantMessage, revisedSuggestion, revisedReasoning, suggestedConstraint };
}
