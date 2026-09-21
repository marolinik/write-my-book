/**
 * The roster of tools an agent holds, rendered into its prompt.
 *
 * `agent-tool-grants.test.ts` has long enforced one direction — a prompt may
 * only name a tool the agent actually holds. This file is the mirror. Thirteen
 * granted tools were named in no prompt at all: the knowledge graph, the
 * writer's memory and the blackboard were all handed out widely and mentioned
 * nowhere.
 *
 * The read half of each of those systems arrives as injected context, so an
 * agent can see what the blackboard already holds. The write half is a tool,
 * and a tool no instruction names is a tool the model has no occasion to call
 * — so the three systems could only ever grow from `promoteFindings`, never
 * from an agent noticing something worth keeping.
 *
 * The roster is generated from `definition.tools`, so a tool granted tomorrow
 * cannot be silent tomorrow. It says nothing about a tool the agent's own
 * prompt already explains: the continuity checker writes a careful sentence
 * per series tool, and a generated line underneath would say the same thing
 * worse, twice.
 */

import { getAgentDefinition } from "./definitions";
import type { AgentType } from "./types";

/**
 * One line per tool: when to reach for it, not what it does. The schema the
 * model receives already carries the description; what it never carries is the
 * occasion.
 *
 * These lines are model-facing English, like every other instruction in the
 * prompt, and are not translated.
 */
export const TOOL_GUIDANCE: Record<string, string> = {
  // ─── Documents and chapters ───────────────────────────────────
  ReadDocument:
    "Read one of this book's documents — the story bible, architecture, synopsis, style fingerprint or a research note. Use it when the injected context did not carry the document you need, or carried a trimmed version of it.",
  WriteDocument:
    "Persist a document you were asked to produce. A run that was asked for a document and ends without calling this has produced nothing, whatever the summary says.",
  ReadChapter:
    "Read one chapter's prose by its number. Use it for a targeted re-read, not to walk the whole book one call at a time.",
  ReadAllChapters:
    "Read the prose of every chapter in one call. Prefer it to looping ReadChapter whenever the job is book-wide.",
  WriteChapter:
    "Write or replace a chapter's prose. This is how a draft or a revision reaches the writer; text that only appears in your reply is lost when the session ends.",
  ListDocuments:
    "List the documents this book has, with their types. Call it before assuming a document is missing — and before writing a second copy of one that already exists.",
  ListChapters:
    "The real chapter numbers, titles and statuses of this book. Every chapter number you cite must come from here, never from counting or from a summary.",

  // ─── Structure and findings ───────────────────────────────────
  ProposeStructureMove:
    "Propose a structural change — split, merge, reorder, move a scene — for the writer to accept or reject. Propose it; never carry it out by rewriting prose yourself.",
  CreateFinding:
    "File one editorial finding against a chapter, with the passage quoted. One finding per issue; a finding without the passage it refers to cannot be acted on.",
  RequestApproval:
    "Stop and ask the writer before an action they would want a say in. Waiting costs a turn; an unwanted change costs their trust.",
  SetVoiceMetrics:
    "Record the measured voice metrics for the style fingerprint you captured, so later agents match numbers rather than adjectives.",

  // ─── Series ───────────────────────────────────────────────────
  ListSeriesBooks:
    "The sibling books in this series with their chapter counts. A series-level check starts here.",
  ReadSiblingChapter:
    "The actual prose of a named chapter in a sibling book. Series documents are summaries, and a book that never contributed to them is invisible there; only this tool sees the other book's text.",
  ReadSeriesDocument:
    "Read a series-level document — the series bible or continuity record — which spans all books rather than this one.",
  WriteSeriesDocument:
    "Persist a series-level document. Use it only for facts that hold across books; a fact about this book alone belongs in this book's documents.",

  // ─── Knowledge graph ──────────────────────────────────────────
  QueryGraph:
    "Ask the book's knowledge graph for the character network, the timeline, the location map, the plot threads, a chapter's entities, or its own consistency checks. Faster and more complete than re-reading chapters to reconstruct any of them.",
  UpdateGraphEntity:
    "An AUTHORITATIVE correction of the graph, and it overrides the continuity protections that keep a dead character dead. Use it ONLY when the writer explicitly asks for a correction. Never use it to record story events as they happen — extraction captures those automatically, and an unrequested edit can silently erase a real death.",

  // ─── Writer memory ────────────────────────────────────────────
  SearchMemory:
    "Semantic search across the whole book — prose, past sessions, documents and findings — returning passages with their source. Reach for it when you need evidence the injected context did not bring, instead of answering from what you happen to have.",
  RememberInsight:
    "Store something this session learned that a later session would otherwise have to rediscover: why a decision went the way it did, an observation about the voice, an outcome. The memory other agents read is only ever as good as what this tool was given.",

  // ─── Blackboard ───────────────────────────────────────────────
  PostInsight:
    "Post a warning, constraint, suggestion or flag to the book's blackboard, where every later agent will see it. Use it when you notice something outside your own remit — the thing you would tell the next specialist if you could talk to them.",
  ReadInsights:
    "Read what other agents have posted to the blackboard. The injected insight block is filtered to you; call this when you need the wider picture or the detail behind a summary.",
  ResolveInsight:
    "Close an insight that this run proves is no longer true. An insight nobody resolves keeps warning every agent about a problem that was fixed chapters ago.",

  // ─── Delegation and the web ───────────────────────────────────
  DelegateToSpecialist:
    "Hand a job to the specialist whose work it is. Always pass both chapterNumber and workflowId — without them the specialist does not know which chapter it is working on and its findings are mislabelled.",
  WebSearch:
    "Search the web for facts outside the manuscript. Anything you present as real — a sales figure, a comparable title, a historical detail — must come from here, never from memory.",
  FetchWebPage:
    "Fetch a specific page you have a URL for, to read the source itself rather than a search snippet.",
};

const WORD_BOUNDARY = String.fromCharCode(92) + "b";

/** Whether the agent's own instructions already name this tool. */
function alreadyNamed(tool: string, instructions: string): boolean {
  return new RegExp(WORD_BOUNDARY + tool + WORD_BOUNDARY).test(instructions);
}

/**
 * The roster block for an agent, covering every granted tool its own
 * instructions leave unmentioned. Returns "" when the prompt already names
 * them all — the continuity checker's hand-written tool section is the reason
 * that case exists.
 *
 * @param type          the agent whose grants to render
 * @param instructions  the instruction text the agent is actually being sent
 */
export function buildToolRoster(type: AgentType | string, instructions: string): string {
  const definition = getAgentDefinition(type as AgentType);
  if (!definition) return "";

  const lines = definition.tools
    .filter((tool) => !alreadyNamed(tool, instructions))
    .map((tool) => (TOOL_GUIDANCE[tool] ? `- ${tool} — ${TOOL_GUIDANCE[tool]}` : ""))
    .filter((line) => line.length > 0);

  if (lines.length === 0) return "";

  return (
    "## TOOLS YOU ALSO HOLD\n" +
    "These are granted to you for this run and are not mentioned above. " +
    "Nothing here is an instruction to call them — reach for one when the " +
    "occasion described is the one in front of you.\n" +
    lines.join("\n")
  );
}
