import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { vi } from "vitest";
import { toContinuityFlags } from "@/lib/continuity/continuity-flags";
import type { ConsistencyIssue } from "@/lib/graph/types";

/**
 * GATE 3 — Continuity-net precision/recall SEEDED CORPUS.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * P3 Selena (the series/continuity persona) scored the platform's crater
 * (D8=4.0 / D7=3.0), the MIN that floor-caps the whole verdict. The root cause
 * (RC-3: non-deterministic extraction self-corrupting the graph) is already
 * fixed on this branch (Fix 7a/b/c event-name canonicalization, monotonic
 * property merge, alias-fold disambiguation; D-79/D-80). This corpus does NOT
 * change detection logic — it provides DETERMINISTIC EVIDENCE that the landed
 * continuity net has real precision/recall, so the gate rests on measured
 * numbers instead of graded theater.
 *
 * WHAT IT MEASURES
 * ----------------
 * The writer-facing pipeline exactly as P3 Selena experiences it:
 *     seeded graph state → runConsistencyChecks() → toContinuityFlags()
 * i.e. detection + the surfacing/dedup layer. Only the four SURFACED flag types
 * reach a writer:
 *   • dead_character_reappears (inline, critical)
 *   • timeline_violation       (inline, critical)
 *   • relationship_contradiction (book-level, major)
 *   • location_conflict        (inline, major) — GATED OFF by default
 * character_undocumented / orphan_plot_thread are computed but never surfaced,
 * so they are out of scope for the writer-facing gate.
 *
 * WHY NO LIVE NEO4J / NO LLM
 * --------------------------
 * The detection layer is pure Cypher over Neo4j (needs a session in prod) and
 * the EXTRACTION layer is a blocked-env LLM (no API key). This corpus seeds the
 * graph STATE DIRECTLY — downstream of extraction — and drives detection through
 * a FAITHFUL in-memory session whose behaviour is DRIVEN BY THE QUERY TEXT (it
 * inspects the generated Cypher to pick the predicate: story-time coalesce vs
 * narrating chapter; directed vs undirected PART_OF; shared-ancestor; same-
 * chapter co-assertion; tenant guard). If a detection fix is reverted, the
 * emulator evaluates the reverted predicate and the corpus goes RED — so these
 * are genuine regression guards, not a mirror of the implementation. The
 * emulator mirrors the one proven in continuity-checks-rewire.test.ts.
 *
 * SCOPE BOUNDARY (RC-3 upstream guards live elsewhere)
 * ----------------------------------------------------
 * The RC-3 fixes that PREVENT graph self-corruption operate at the UPSERT layer
 * (graph-builder), and already have dedicated tests:
 *   • Fix 7a event-name canonicalization → graph-event-name-canonicalization.test.ts
 *   • Fix 7b monotonic/sticky-dead merge  → continuity-graph-properties.test.ts
 *   • Fix 7c alias-fold disambiguation     → graph-alias-merge-disambiguation.test.ts
 * This corpus adds their DETECTION-LAYER complement: given a correctly-resolved
 * graph, detection respects node identity (an alias does not split a character;
 * two distinct same-surname characters are not cross-implicated).
 *
 * Live-Neo4j integration (running the exact Cypher against a populated graph)
 * remains BLOCKED-ENV in this run and is tracked separately.
 */

// ─── In-memory graph model (bookId injected by the add* helpers) ─────────────
type Char = {
  name: string;
  aliases?: string[]; // documented intent only; detection keys on the node name
  userId?: string;
  status?: string;
  deathChapter?: number | null;
  role?: string;
  description?: string | null;
  firstAppearance?: number;
  lastMentioned?: number;
};
type Ev = {
  name: string;
  userId?: string;
  chapter?: number;
  occursInChapter?: number;
};

const g = vi.hoisted(() => ({
  characters: new Map<string, any>(),
  events: new Map<string, any>(),
  locations: new Set<string>(),
  participatesIn: [] as Array<{ char: string; event: string }>,
  locatedAt: [] as Array<{ event: string; location: string }>,
  partOf: [] as Array<{ child: string; parent: string }>, // Location child -PART_OF-> parent
  allied: [] as Array<{ a: string; b: string; chapter: number | null }>,
  opposes: [] as Array<{ a: string; b: string; chapter: number | null }>,
  leadsTo: [] as Array<{ later: string; earlier: string }>, // (later)-[:LEADS_TO]->(earlier)
}));

/** Directed PART_OF descendant test (length >= 1): is `a` nested inside `b`? */
function isDescendant(a: string, b: string): boolean {
  const seen = new Set<string>();
  let frontier = g.partOf.filter((e) => e.child === a).map((e) => e.parent);
  while (frontier.length) {
    const next: string[] = [];
    for (const p of frontier) {
      if (p === b) return true;
      if (seen.has(p)) continue;
      seen.add(p);
      for (const e of g.partOf.filter((x) => x.child === p)) next.push(e.parent);
    }
    frontier = next;
  }
  return false;
}
function hasSharedAncestor(a: string, b: string): boolean {
  for (const loc of g.locations) {
    if (loc === a || loc === b) continue;
    if (isDescendant(a, loc) && isDescendant(b, loc)) return true;
  }
  return false;
}

const rec = (obj: Record<string, unknown>) => ({ get: (k: string) => obj[k] });

function passesUserGuard(query: string, varName: string, node: any, params: any): boolean {
  if (!query.includes(`${varName}.userId = $userId`)) return true; // no tenant guard in query
  // Null-safe: legacy (no userId) always matches; otherwise must equal.
  return node.userId == null || node.userId === params.userId;
}

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (_mode: string, fn: (s: unknown) => Promise<unknown>) => {
    const session = {
      run: async (query: string, params: Record<string, any> = {}) => {
        // ── relationship_contradiction ──
        if (query.includes(":ALLIED_WITH]") && query.includes(":OPPOSES]")) {
          const requiresSameChapter = query.includes("r1.chapter = r2.chapter");
          const rows: any[] = [];
          const seen = new Set<string>();
          for (const al of g.allied) {
            const pairs = [
              [al.a, al.b],
              [al.b, al.a],
            ];
            for (const [x, y] of pairs) {
              const opp = g.opposes.find(
                (o) => (o.a === x && o.b === y) || (o.a === y && o.b === x)
              );
              if (!opp) continue;
              const [c1, c2] = [x, y].sort(); // id(a) < id(b) dedup
              if (seen.has(`${c1}|${c2}`)) continue;
              if (requiresSameChapter && al.chapter !== opp.chapter) continue;
              const cNode = g.characters.get(c1);
              if (!passesUserGuard(query, "a", cNode ?? {}, params)) continue;
              seen.add(`${c1}|${c2}`);
              rows.push(rec({ char1: c1, char2: c2, chapter: requiresSameChapter ? al.chapter : null }));
            }
          }
          return { records: rows };
        }

        // ── dead_character_reappears ──
        if (query.includes('c.status = "dead"')) {
          const useStoryTime = query.includes("coalesce(e.occursInChapter, e.chapter)");
          const rows: any[] = [];
          for (const c of g.characters.values()) {
            if (c.status !== "dead" || c.deathChapter == null) continue;
            if (!passesUserGuard(query, "c", c, params)) continue;
            const postChapters = new Set<number>();
            for (const p of g.participatesIn.filter((x) => x.char === c.name)) {
              const e = g.events.get(p.event);
              if (!e) continue;
              const cmp = useStoryTime ? e.occursInChapter ?? e.chapter : e.chapter;
              if (cmp != null && cmp > c.deathChapter) postChapters.add(cmp);
            }
            if (postChapters.size > 0) {
              rows.push(
                rec({
                  character: c.name,
                  deathChapter: c.deathChapter,
                  postDeathChapters: [...postChapters],
                })
              );
            }
          }
          return { records: rows };
        }

        // ── timeline_violation ──
        if (query.includes(":LEADS_TO]")) {
          const useStoryTime = query.includes("coalesce(later.occursInChapter, later.chapter)");
          const rows: any[] = [];
          for (const edge of g.leadsTo) {
            const later = g.events.get(edge.later);
            const earlier = g.events.get(edge.earlier);
            if (!later || !earlier) continue;
            if (!passesUserGuard(query, "later", later, params)) continue;
            const lc = useStoryTime ? later.occursInChapter ?? later.chapter : later.chapter;
            const ec = useStoryTime ? earlier.occursInChapter ?? earlier.chapter : earlier.chapter;
            if (lc != null && ec != null && lc > ec) {
              rows.push(
                rec({ laterEvent: later.name, laterChapter: lc, earlierEvent: earlier.name, earlierChapter: ec })
              );
            }
          }
          return { records: rows };
        }

        // ── location_conflict (only issued when the env flag is ON) ──
        if (query.includes("AS location1")) {
          const useStoryTime = query.includes("coalesce(e1.occursInChapter, e1.chapter)");
          const directedExempt = query.includes("(l1)-[:PART_OF*]->(l2)"); // directed ancestry
          const requiresSharedAncestor = query.includes("(shared:Location");
          const rows: any[] = [];
          const seen = new Set<string>();
          for (const c of g.characters.values()) {
            if (!passesUserGuard(query, "c", c, params)) continue;
            const myEvents = g.participatesIn
              .filter((p) => p.char === c.name)
              .map((p) => g.events.get(p.event))
              .filter(Boolean) as any[];
            for (let i = 0; i < myEvents.length; i++) {
              for (let j = 0; j < myEvents.length; j++) {
                if (i >= j) continue; // id(e1) < id(e2)
                const e1 = myEvents[i];
                const e2 = myEvents[j];
                const l1 = g.locatedAt.find((x) => x.event === e1.name)?.location;
                const l2 = g.locatedAt.find((x) => x.event === e2.name)?.location;
                if (!l1 || !l2 || l1 === l2) continue;
                const c1 = useStoryTime ? e1.occursInChapter ?? e1.chapter : e1.chapter;
                const c2 = useStoryTime ? e2.occursInChapter ?? e2.chapter : e2.chapter;
                if (c1 == null || c1 !== c2) continue;
                if (directedExempt) {
                  if (isDescendant(l1, l2) || isDescendant(l2, l1)) continue; // nested → exempt
                }
                if (requiresSharedAncestor && !hasSharedAncestor(l1, l2)) continue;
                const key = `${c.name}|${[e1.name, e2.name].sort().join("|")}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rows.push(
                  rec({ character: c.name, chapter: c1, location1: l1, location2: l2, event1: e1.name, event2: e2.name })
                );
              }
            }
          }
          return { records: rows };
        }

        // character_undocumented / orphan_plot_thread — never surfaced; not seeded.
        return { records: [] };
      },
    };
    return fn(session);
  },
}));

import { runConsistencyChecks } from "@/lib/graph/graph-queries";

const B = "book-1";

function reset() {
  g.characters.clear();
  g.events.clear();
  g.locations.clear();
  g.participatesIn.length = 0;
  g.locatedAt.length = 0;
  g.partOf.length = 0;
  g.allied.length = 0;
  g.opposes.length = 0;
  g.leadsTo.length = 0;
}
function addChar(c: Char) {
  g.characters.set(c.name, { bookId: B, ...c });
}
function addEvent(e: Ev) {
  g.events.set(e.name, { bookId: B, ...e });
}
function addLoc(name: string, parent?: string) {
  g.locations.add(name);
  if (parent) {
    g.locations.add(parent);
    g.partOf.push({ child: name, parent });
  }
}
function participates(char: string, event: string) {
  g.participatesIn.push({ char, event });
}

// ─── Corpus scaffolding ──────────────────────────────────────────────────────
type SurfacedType =
  | "dead_character_reappears"
  | "timeline_violation"
  | "relationship_contradiction"
  | "location_conflict";
type FlagId = { type: SurfacedType; entities: string[] };
type Scenario = {
  id: string;
  cls: "TP" | "TN";
  desc: string;
  seed: () => void;
  expected: FlagId[]; // ground-truth SURFACED flags for this seeded state
  userId?: string;
};

/** Identity key for a surfaced flag — type + its entity SET (order-free). */
function flagKey(type: string, entities: string[]): string {
  return `${type}::${[...entities].sort().join("|")}`;
}

async function producedKeysFor(s: Scenario): Promise<string[]> {
  reset();
  s.seed();
  const issues: ConsistencyIssue[] = await runConsistencyChecks(B, s.userId);
  const flags = toContinuityFlags({ issues, intentionalSignatures: new Set<string>() });
  return flags.map((f) => flagKey(f.type, f.entities)).sort();
}
const expectedKeysFor = (s: Scenario): string[] =>
  s.expected.map((e) => flagKey(e.type, e.entities)).sort();

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT-CONFIG CORPUS (location_conflict OFF — production default).
// Measures dead_character_reappears + timeline_violation + relationship_contradiction.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CORPUS: Scenario[] = [
  // ── dead_character_reappears — TRUE POSITIVES ─────────────────────────────
  {
    id: "TP-dead-01 present-time reappearance",
    cls: "TP",
    desc: "dead ch5, participates in a present ch8 event → flag",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 5 });
      addEvent({ name: "The Ambush", chapter: 8, occursInChapter: 8 });
      participates("Corvin", "The Ambush");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Corvin"] }],
  },
  {
    id: "TP-dead-02 killed ch5 speaking ch8",
    cls: "TP",
    desc: "a character killed in ch5 speaks/acts in ch8 → flag (the P3 hero case)",
    seed: () => {
      addChar({ name: "Sela", status: "dead", deathChapter: 5 });
      addEvent({ name: "Council Speech", chapter: 8, occursInChapter: 8 });
      participates("Sela", "Council Speech");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Sela"] }],
  },
  {
    id: "TP-dead-03 posthumous introduction then acts",
    cls: "TP",
    desc: "introduced already-dead in ch4 (off-page death), then a present ch7 act → flag",
    seed: () => {
      addChar({ name: "Halden", status: "dead", deathChapter: 4 });
      addEvent({ name: "The Raid", chapter: 7, occursInChapter: 7 });
      participates("Halden", "The Raid");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Halden"] }],
  },
  {
    id: "TP-dead-04 multiple reappearances → single anchored flag",
    cls: "TP",
    desc: "dead ch4, acts in ch6 AND ch9 → ONE flag (death-anchor, D-79), not two",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 4 });
      addEvent({ name: "E6", chapter: 6, occursInChapter: 6 });
      addEvent({ name: "E9", chapter: 9, occursInChapter: 9 });
      participates("Corvin", "E6");
      participates("Corvin", "E9");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Corvin"] }],
  },
  {
    id: "TP-dead-05 large-gap reappearance",
    cls: "TP",
    desc: "dead ch2, acts ch10 → flag",
    seed: () => {
      addChar({ name: "Bram", status: "dead", deathChapter: 2 });
      addEvent({ name: "Late Return", chapter: 10, occursInChapter: 10 });
      participates("Bram", "Late Return");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Bram"] }],
  },
  {
    id: "TP-dead-06 two distinct dead characters both reappear",
    cls: "TP",
    desc: "Corvin(dead3→ch8) AND Vera(dead2→ch7) both reappear → two independent flags",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 3 });
      addChar({ name: "Vera", status: "dead", deathChapter: 2 });
      addEvent({ name: "C-Act", chapter: 8, occursInChapter: 8 });
      addEvent({ name: "V-Act", chapter: 7, occursInChapter: 7 });
      participates("Corvin", "C-Act");
      participates("Vera", "V-Act");
    },
    expected: [
      { type: "dead_character_reappears", entities: ["Corvin"] },
      { type: "dead_character_reappears", entities: ["Vera"] },
    ],
  },
  {
    id: "TP-dead-07 early death ch1 acts ch2",
    cls: "TP",
    desc: "dead ch1, acts ch2 → flag (tight boundary just past death)",
    seed: () => {
      addChar({ name: "Otho", status: "dead", deathChapter: 1 });
      addEvent({ name: "Next Chapter Act", chapter: 2, occursInChapter: 2 });
      participates("Otho", "Next Chapter Act");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Otho"] }],
  },
  {
    id: "TP-dead-08 alias-fold: one node reappears → exactly ONE flag (RC-3 detection guard)",
    cls: "TP",
    desc: "a single character node carrying a canonical alias, dead ch5, acts ch8 → ONE flag (aliases must not split identity into two phantom flags)",
    seed: () => {
      // Fix 7c means this is ONE node with an alias, not two. Detection keys on
      // the node → exactly one flag. Two flags here would be the crater path.
      addChar({ name: "Seraphine Vale", aliases: ["Sera"], status: "dead", deathChapter: 5 });
      addEvent({ name: "Return of Sera", chapter: 8, occursInChapter: 8 });
      participates("Seraphine Vale", "Return of Sera");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Seraphine Vale"] }],
  },

  // ── dead_character_reappears — TRUE NEGATIVES ─────────────────────────────
  {
    id: "TN-dead-01 living character acting normally",
    cls: "TN",
    desc: "alive character acts in ch2 and ch8 → no flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addEvent({ name: "Scene A", chapter: 2, occursInChapter: 2 });
      addEvent({ name: "Scene B", chapter: 8, occursInChapter: 8 });
      participates("Mira", "Scene A");
      participates("Mira", "Scene B");
    },
    expected: [],
  },
  {
    id: "TN-dead-02 appearances strictly BEFORE the death chapter",
    cls: "TN",
    desc: "acts ch2 & ch3, dies ch5, no post-death act → no flag",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 5 });
      addEvent({ name: "Before A", chapter: 2, occursInChapter: 2 });
      addEvent({ name: "Before B", chapter: 3, occursInChapter: 3 });
      participates("Corvin", "Before A");
      participates("Corvin", "Before B");
    },
    expected: [],
  },
  {
    id: "TN-dead-03 retelling: story-time before death",
    cls: "TN",
    desc: "dead ch3; a ch8-narrated retelling whose occursInChapter=3 → no flag (RC-2 story-time)",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 3 });
      addEvent({ name: "Retelling of the Death", chapter: 8, occursInChapter: 3 });
      participates("Corvin", "Retelling of the Death");
    },
    expected: [],
  },
  {
    id: "TN-dead-04 mentioned-only, no participation (D-19 precision)",
    cls: "TN",
    desc: "dead ch3; a later ch8 event exists but the character does NOT PARTICIPATE (only grieved/named) → no flag",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 3 });
      addEvent({ name: "The Wake", chapter: 8, occursInChapter: 8 });
      // deliberately NO participates() edge — a mention is not a reappearance.
    },
    expected: [],
  },
  {
    id: "TN-dead-05 act in the SAME chapter as death (not strictly after)",
    cls: "TN",
    desc: "dead ch5; participates in an event whose story-time is exactly ch5 → no flag (must be strictly after)",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 5 });
      addEvent({ name: "Deathbed Scene", chapter: 5, occursInChapter: 5 });
      participates("Corvin", "Deathbed Scene");
    },
    expected: [],
  },
  {
    id: "TN-dead-06 distinct same-surname characters (RC-3 crater guard)",
    cls: "TN",
    desc: "Sera Vance dies ch5 (no reappearance); a DISTINCT Lord Vance (alive) acts ch8 → no flag — Lord Vance's act must NOT be attributed to the dead Sera",
    seed: () => {
      addChar({ name: "Sera Vance", status: "dead", deathChapter: 5 });
      addChar({ name: "Lord Vance", status: "alive" });
      addEvent({ name: "Vance Estate Scene", chapter: 8, occursInChapter: 8 });
      participates("Lord Vance", "Vance Estate Scene");
    },
    expected: [],
  },
  {
    id: "TN-dead-07 dead with no events at all",
    cls: "TN",
    desc: "dead ch4, never participates in anything → no flag",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 4 });
    },
    expected: [],
  },
  {
    id: "TN-dead-08 transformed (not dead) character acts later",
    cls: "TN",
    desc: "a 'transformed' character (status != dead) acts ch8 → no flag (only status='dead' + deathChapter trips it)",
    seed: () => {
      addChar({ name: "Nyx", status: "transformed", deathChapter: null });
      addEvent({ name: "Reborn Scene", chapter: 8, occursInChapter: 8 });
      participates("Nyx", "Reborn Scene");
    },
    expected: [],
  },

  // ── timeline_violation — TRUE POSITIVES ───────────────────────────────────
  {
    id: "TP-time-01 effect precedes cause",
    cls: "TP",
    desc: "ch8 event LEADS_TO a ch3 event (story-time) → flag",
    seed: () => {
      addEvent({ name: "The Midnight Bargain", chapter: 8, occursInChapter: 8 });
      addEvent({ name: "Death of Corvin", chapter: 3, occursInChapter: 3 });
      g.leadsTo.push({ later: "The Midnight Bargain", earlier: "Death of Corvin" });
    },
    expected: [
      { type: "timeline_violation", entities: ["The Midnight Bargain", "Death of Corvin"] },
    ],
  },
  {
    id: "TP-time-02 multi-chapter causal loop",
    cls: "TP",
    desc: "ch10 event LEADS_TO a ch2 event → flag",
    seed: () => {
      addEvent({ name: "The Reckoning", chapter: 10, occursInChapter: 10 });
      addEvent({ name: "The First Spark", chapter: 2, occursInChapter: 2 });
      g.leadsTo.push({ later: "The Reckoning", earlier: "The First Spark" });
    },
    expected: [
      { type: "timeline_violation", entities: ["The Reckoning", "The First Spark"] },
    ],
  },
  {
    id: "TP-time-03 two distinct violations",
    cls: "TP",
    desc: "two independent effect-precedes-cause loops → two flags",
    seed: () => {
      addEvent({ name: "A-late", chapter: 9, occursInChapter: 9 });
      addEvent({ name: "A-early", chapter: 4, occursInChapter: 4 });
      addEvent({ name: "B-late", chapter: 7, occursInChapter: 7 });
      addEvent({ name: "B-early", chapter: 1, occursInChapter: 1 });
      g.leadsTo.push({ later: "A-late", earlier: "A-early" });
      g.leadsTo.push({ later: "B-late", earlier: "B-early" });
    },
    expected: [
      { type: "timeline_violation", entities: ["A-late", "A-early"] },
      { type: "timeline_violation", entities: ["B-late", "B-early"] },
    ],
  },

  // ── timeline_violation — TRUE NEGATIVES ───────────────────────────────────
  {
    id: "TN-time-01 legitimate cause→effect",
    cls: "TN",
    desc: "ch3 event LEADS_TO a ch8 event → no flag",
    seed: () => {
      addEvent({ name: "The Spark", chapter: 3, occursInChapter: 3 });
      addEvent({ name: "The Fire", chapter: 8, occursInChapter: 8 });
      g.leadsTo.push({ later: "The Spark", earlier: "The Fire" });
    },
    expected: [],
  },
  {
    id: "TN-time-02 same-chapter causal link",
    cls: "TN",
    desc: "ch5 event LEADS_TO another ch5 event → no flag (not strictly later > earlier)",
    seed: () => {
      addEvent({ name: "Trigger", chapter: 5, occursInChapter: 5 });
      addEvent({ name: "Consequence", chapter: 5, occursInChapter: 5 });
      g.leadsTo.push({ later: "Trigger", earlier: "Consequence" });
    },
    expected: [],
  },
  {
    id: "TN-time-03 flashback narrated late but story-time earlier",
    cls: "TN",
    desc: "an event narrated in ch9 but occurring in ch2 LEADS_TO a ch2 event → story-time 2 !> 2 → no flag (RC-2)",
    seed: () => {
      addEvent({ name: "Narrated Vision", chapter: 9, occursInChapter: 2 });
      addEvent({ name: "The Origin", chapter: 2, occursInChapter: 2 });
      g.leadsTo.push({ later: "Narrated Vision", earlier: "The Origin" });
    },
    expected: [],
  },

  // ── relationship_contradiction — TRUE POSITIVES ───────────────────────────
  {
    id: "TP-rel-01 allied AND opposed same chapter",
    cls: "TP",
    desc: "Mira & Vane marked ALLIED_WITH and OPPOSES both in ch5 → flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      g.allied.push({ a: "Mira", b: "Vane", chapter: 5 });
      g.opposes.push({ a: "Mira", b: "Vane", chapter: 5 });
    },
    expected: [{ type: "relationship_contradiction", entities: ["Mira", "Vane"] }],
  },
  {
    id: "TP-rel-02 reversed-direction same chapter",
    cls: "TP",
    desc: "allied A→B and opposes B→A in the same chapter → flag (undirected)",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      g.allied.push({ a: "Mira", b: "Vane", chapter: 5 });
      g.opposes.push({ a: "Vane", b: "Mira", chapter: 5 });
    },
    expected: [{ type: "relationship_contradiction", entities: ["Mira", "Vane"] }],
  },
  {
    id: "TP-rel-03 two distinct contradicting pairs",
    cls: "TP",
    desc: "two independent same-chapter contradictions → two flags",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      addChar({ name: "Cael", status: "alive" });
      addChar({ name: "Ryn", status: "alive" });
      g.allied.push({ a: "Mira", b: "Vane", chapter: 5 });
      g.opposes.push({ a: "Mira", b: "Vane", chapter: 5 });
      g.allied.push({ a: "Cael", b: "Ryn", chapter: 6 });
      g.opposes.push({ a: "Cael", b: "Ryn", chapter: 6 });
    },
    expected: [
      { type: "relationship_contradiction", entities: ["Mira", "Vane"] },
      { type: "relationship_contradiction", entities: ["Cael", "Ryn"] },
    ],
  },

  // ── relationship_contradiction — TRUE NEGATIVES ───────────────────────────
  {
    id: "TN-rel-01 evolving relationship across chapters",
    cls: "TN",
    desc: "allied in ch2, enemies by ch9 → no flag (a legitimate arc, not a contradiction)",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      g.allied.push({ a: "Mira", b: "Vane", chapter: 2 });
      g.opposes.push({ a: "Mira", b: "Vane", chapter: 9 });
    },
    expected: [],
  },
  {
    id: "TN-rel-02 allied only",
    cls: "TN",
    desc: "only an ALLIED_WITH edge exists → no flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      g.allied.push({ a: "Mira", b: "Vane", chapter: 5 });
    },
    expected: [],
  },
  {
    id: "TN-rel-03 opposed only",
    cls: "TN",
    desc: "only an OPPOSES edge exists → no flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      g.opposes.push({ a: "Mira", b: "Vane", chapter: 5 });
    },
    expected: [],
  },
  {
    id: "TN-rel-04 allied ch2 opposed ch4 (different chapters)",
    cls: "TN",
    desc: "allied ch2 and opposed ch4 → no flag (not co-asserted in one chapter)",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      g.allied.push({ a: "Mira", b: "Vane", chapter: 2 });
      g.opposes.push({ a: "Mira", b: "Vane", chapter: 4 });
    },
    expected: [],
  },

  // ── cross-cutting: tenant guard (RC-6) + a fully-clean book ────────────────
  {
    id: "TP-tenant-01 unscoped legacy scan still flags a real reappearance",
    cls: "TP",
    desc: "dead reappearance owned by 'owner'; scanned WITHOUT a tenant (bookId-only) → flag still surfaces",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 3, userId: "owner" });
      addEvent({ name: "Ghost Walk", chapter: 8, occursInChapter: 8, userId: "owner" });
      participates("Corvin", "Ghost Walk");
    },
    expected: [{ type: "dead_character_reappears", entities: ["Corvin"] }],
    // no userId → legacy bookId-scoped scan
  },
  {
    id: "TN-tenant-01 foreign-tenant node excluded when scoped",
    cls: "TN",
    desc: "a dead-reappearance node owned by 'other-tenant', scanned as 'victim-tenant' → excluded, no flag (RC-6)",
    seed: () => {
      addChar({ name: "Corvin", status: "dead", deathChapter: 3, userId: "other-tenant" });
      addEvent({ name: "The Ambush", chapter: 8, occursInChapter: 8 });
      participates("Corvin", "The Ambush");
    },
    expected: [],
    userId: "victim-tenant",
  },
  {
    id: "TN-clean-01 fully consistent multi-character book",
    cls: "TN",
    desc: "living cast, chronological cause→effect, evolving alliance — a clean book → zero flags",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addChar({ name: "Vane", status: "alive" });
      addChar({ name: "Corvin", status: "dead", deathChapter: 6 });
      addEvent({ name: "Departure", chapter: 2, occursInChapter: 2 });
      addEvent({ name: "Arrival", chapter: 4, occursInChapter: 4 });
      participates("Mira", "Departure");
      participates("Vane", "Arrival");
      participates("Corvin", "Departure"); // before his ch6 death — legitimate
      g.leadsTo.push({ later: "Departure", earlier: "Arrival" }); // ch2 → ch4, chronological
      g.allied.push({ a: "Mira", b: "Vane", chapter: 2 });
      g.opposes.push({ a: "Mira", b: "Vane", chapter: 9 }); // evolves — not a contradiction
    },
    expected: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GATED CORPUS: location_conflict (env flag ON). Reported SEPARATELY because the
// detector is DEFAULT-OFF in production (FP-B; founder-decision "fix 8" pending).
// Not counted in the default P/R above.
// ─────────────────────────────────────────────────────────────────────────────
const LOCATION_CORPUS: Scenario[] = [
  {
    id: "LC-TP-01 sibling co-location same chapter",
    cls: "TP",
    desc: "Mira at Salt Docks AND Cinder Ward (both PART_OF Emberfall) in ch7 → flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addLoc("Salt Docks", "Emberfall");
      addLoc("Cinder Ward", "Emberfall");
      addEvent({ name: "Grain Unloading", chapter: 7, occursInChapter: 7 });
      addEvent({ name: "Cinder Ward Raid", chapter: 7, occursInChapter: 7 });
      g.locatedAt.push({ event: "Grain Unloading", location: "Salt Docks" });
      g.locatedAt.push({ event: "Cinder Ward Raid", location: "Cinder Ward" });
      participates("Mira", "Grain Unloading");
      participates("Mira", "Cinder Ward Raid");
    },
    expected: [
      { type: "location_conflict", entities: ["Mira", "Salt Docks", "Cinder Ward"] },
    ],
  },
  {
    id: "LC-TP-02 deeper-nested siblings sharing an ancestor",
    cls: "TP",
    desc: "two rooms in different buildings of the same city, same chapter → flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addLoc("Keep Hall", "North Keep");
      addLoc("North Keep", "Emberfall");
      addLoc("Dock Office", "Salt Docks");
      addLoc("Salt Docks", "Emberfall");
      addEvent({ name: "Hall Meeting", chapter: 4, occursInChapter: 4 });
      addEvent({ name: "Office Deal", chapter: 4, occursInChapter: 4 });
      g.locatedAt.push({ event: "Hall Meeting", location: "Keep Hall" });
      g.locatedAt.push({ event: "Office Deal", location: "Dock Office" });
      participates("Mira", "Hall Meeting");
      participates("Mira", "Office Deal");
    },
    expected: [
      { type: "location_conflict", entities: ["Mira", "Keep Hall", "Dock Office"] },
    ],
  },
  {
    id: "LC-TN-01 nested containment (room inside its city)",
    cls: "TN",
    desc: "at Salt Docks AND at Emberfall (the docks are IN Emberfall) → no flag (directed ancestry exempt)",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addLoc("Salt Docks", "Emberfall");
      addEvent({ name: "Docks Scene", chapter: 7, occursInChapter: 7 });
      addEvent({ name: "City Scene", chapter: 7, occursInChapter: 7 });
      g.locatedAt.push({ event: "Docks Scene", location: "Salt Docks" });
      g.locatedAt.push({ event: "City Scene", location: "Emberfall" });
      participates("Mira", "Docks Scene");
      participates("Mira", "City Scene");
    },
    expected: [],
  },
  {
    id: "LC-TN-02 unrelated locations (no shared ancestor)",
    cls: "TN",
    desc: "two far-apart locations with no shared parent, same chapter → no flag (legitimate travel)",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addLoc("Ashfall Gate");
      addLoc("Cindermoor Bridge");
      addEvent({ name: "Rally", chapter: 3, occursInChapter: 3 });
      addEvent({ name: "Burial", chapter: 3, occursInChapter: 3 });
      g.locatedAt.push({ event: "Rally", location: "Ashfall Gate" });
      g.locatedAt.push({ event: "Burial", location: "Cindermoor Bridge" });
      participates("Mira", "Rally");
      participates("Mira", "Burial");
    },
    expected: [],
  },
  {
    id: "LC-TN-03 siblings at different story-times (flashback beat)",
    cls: "TN",
    desc: "sibling locations but one event is a flashback (occursInChapter differs) → no flag",
    seed: () => {
      addChar({ name: "Mira", status: "alive" });
      addLoc("Salt Docks", "Emberfall");
      addLoc("Cinder Ward", "Emberfall");
      addEvent({ name: "Present Docks", chapter: 7, occursInChapter: 7 });
      addEvent({ name: "Flashback Ward", chapter: 7, occursInChapter: 2 });
      g.locatedAt.push({ event: "Present Docks", location: "Salt Docks" });
      g.locatedAt.push({ event: "Flashback Ward", location: "Cinder Ward" });
      participates("Mira", "Present Docks");
      participates("Mira", "Flashback Ward");
    },
    expected: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Per-scenario proofs (each scenario is an individually-named passing test) plus
// an aggregate precision/recall assertion (the gate metric).
// ─────────────────────────────────────────────────────────────────────────────

describe("Gate 3 — continuity net DEFAULT-config seeded corpus (location_conflict OFF)", () => {
  let prevFlag: string | undefined;
  beforeAll(() => {
    prevFlag = process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    delete process.env.ENABLE_LOCATION_CONFLICT_CHECK; // production default
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    else process.env.ENABLE_LOCATION_CONFLICT_CHECK = prevFlag;
  });
  beforeEach(reset);

  it("corpus has at least 30 default-config scenarios", () => {
    expect(DEFAULT_CORPUS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(DEFAULT_CORPUS.map((s) => [s.id, s] as const))(
    "%s",
    async (_id, s) => {
      const produced = await producedKeysFor(s);
      expect(produced).toEqual(expectedKeysFor(s));
    }
  );

  it("PRECISION = 1.0 and RECALL = 1.0 across the whole default corpus", async () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    const mismatches: string[] = [];
    for (const s of DEFAULT_CORPUS) {
      const produced = new Set(await producedKeysFor(s));
      const expected = new Set(expectedKeysFor(s));
      for (const k of produced) expected.has(k) ? tp++ : (fp++, mismatches.push(`FP ${s.id}: ${k}`));
      for (const k of expected) if (!produced.has(k)) (fn++, mismatches.push(`FN ${s.id}: ${k}`));
    }
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    // Deterministic corpus on landed code: every seeded violation caught, zero
    // false positives. Any deviation is a DETECTION BUG to report, not to paper over.
    expect(mismatches).toEqual([]);
    expect(fp).toBe(0);
    expect(fn).toBe(0);
    expect(precision).toBe(1);
    expect(recall).toBe(1);
    // sanity: the corpus actually exercises real positives (not vacuously green)
    expect(tp).toBeGreaterThanOrEqual(15);
  });
});

describe("Gate 3 — location_conflict GATED corpus (env flag ON; default-OFF in prod)", () => {
  let prevFlag: string | undefined;
  beforeAll(() => {
    prevFlag = process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    process.env.ENABLE_LOCATION_CONFLICT_CHECK = "true";
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    else process.env.ENABLE_LOCATION_CONFLICT_CHECK = prevFlag;
  });
  beforeEach(reset);

  it.each(LOCATION_CORPUS.map((s) => [s.id, s] as const))(
    "%s",
    async (_id, s) => {
      const produced = await producedKeysFor(s);
      expect(produced).toEqual(expectedKeysFor(s));
    }
  );

  it("PRECISION = 1.0 and RECALL = 1.0 across the gated location_conflict corpus", async () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const s of LOCATION_CORPUS) {
      const produced = new Set(await producedKeysFor(s));
      const expected = new Set(expectedKeysFor(s));
      for (const k of produced) expected.has(k) ? tp++ : fp++;
      for (const k of expected) if (!produced.has(k)) fn++;
    }
    expect(fp).toBe(0);
    expect(fn).toBe(0);
    expect(tp).toBeGreaterThanOrEqual(2);
  });
});

describe("Gate 3 — location_conflict is DEFAULT-OFF (FP-B gate)", () => {
  it("does NOT fire on the seeded true-conflict topology when the env flag is unset", async () => {
    const prevFlag = process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    try {
      const produced = await producedKeysFor(LOCATION_CORPUS[0]); // the true-conflict scenario
      expect(produced).toEqual([]); // gated off → no flag despite the impossible topology
    } finally {
      if (prevFlag === undefined) delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
      else process.env.ENABLE_LOCATION_CONFLICT_CHECK = prevFlag;
    }
  });
});
