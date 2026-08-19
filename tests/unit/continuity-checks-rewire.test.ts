import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * RC-2 + RC-5 + Fix 4/6/8 fire/no-fire proofs for runConsistencyChecks().
 *
 * The four continuity checks are pure Cypher against Neo4j, so there is no live
 * DB in a unit run. Instead the fake session below is a FAITHFUL in-memory graph
 * whose evaluation of each check is DRIVEN BY THE QUERY TEXT: it inspects the
 * generated Cypher to decide which predicate to apply (story-time coalesce vs
 * narrating chapter; directed vs undirected PART_OF; shared-ancestor requirement;
 * same-chapter relationship co-assertion; tenant guard). If a fix is reverted the
 * emulator evaluates the reverted predicate and the corresponding test fails — so
 * these are genuine regression guards, not a mirror of the implementation.
 *
 * Live-Neo4j integration (per the P3 re-run TEST-PLAN §4) still runs the exact
 * Cypher against a populated graph; this proves the check logic in isolation.
 */

// ─── In-memory graph model ───────────────────────────────────────────────
// (bookId is injected by the addChar/addEvent helpers, not part of the input.)
type Char = {
  name: string;
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
            // undirected pair
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

        // ── location_conflict ──
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
                // Exemption logic mirrors the query.
                if (directedExempt) {
                  if (isDescendant(l1, l2) || isDescendant(l2, l1)) continue; // nested → exempt
                } else if (query.includes("(l1)-[:PART_OF*]-(l2)")) {
                  // OLD undirected exemption: connected either way (incl. siblings).
                  if (isDescendant(l1, l2) || isDescendant(l2, l1) || hasSharedAncestor(l1, l2)) continue;
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

        // character_undocumented / orphan_plot_thread — not seeded here.
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
const issuesOfType = (issues: any[], t: string) => issues.filter((i) => i.type === t);

beforeEach(reset);

// ─── Fix 4 (RC-2 C1): relationship_contradiction is chapter-aware ─────────
describe("relationship_contradiction — same-chapter co-assertion (Fix 4 / RC-2 C1)", () => {
  it("does NOT flag an EVOLVING relationship (allied ch2, enemies ch9) — the perpetual-FP case", async () => {
    addChar({ name: "Mira", status: "alive" });
    addChar({ name: "Vane", status: "alive" });
    g.allied.push({ a: "Mira", b: "Vane", chapter: 2 });
    g.opposes.push({ a: "Mira", b: "Vane", chapter: 9 });
    const issues = await runConsistencyChecks(B);
    expect(issuesOfType(issues, "relationship_contradiction")).toHaveLength(0);
  });

  it("DOES flag a genuine SAME-chapter contradiction (allied AND opposed in ch5)", async () => {
    addChar({ name: "Mira", status: "alive" });
    addChar({ name: "Vane", status: "alive" });
    g.allied.push({ a: "Mira", b: "Vane", chapter: 5 });
    g.opposes.push({ a: "Vane", b: "Mira", chapter: 5 }); // reversed direction, same chapter
    const issues = await runConsistencyChecks(B);
    const flags = issuesOfType(issues, "relationship_contradiction");
    expect(flags).toHaveLength(1);
    expect(flags[0].chapters).toEqual([5]);
    expect(flags[0].description).toContain("chapter 5");
  });
});

// ─── Fix 6 (RC-2 C2): dead_character_reappears keys off STORY-time ────────
describe("dead_character_reappears — story-time (Fix 6 / RC-2 C2 / D-32b)", () => {
  it("does NOT flag a RETELLING: dead in ch3, participates in a ch8-narrated event whose occursInChapter=3", async () => {
    addChar({ name: "Corvin", status: "dead", deathChapter: 3 });
    addEvent({ name: "Retelling of the Death", chapter: 8, occursInChapter: 3 });
    g.participatesIn.push({ char: "Corvin", event: "Retelling of the Death" });
    const issues = await runConsistencyChecks(B);
    expect(issuesOfType(issues, "dead_character_reappears")).toHaveLength(0);
  });

  it("DOES flag a genuine reappearance: dead in ch3, participates in a present ch8 event (occursInChapter defaults to 8)", async () => {
    addChar({ name: "Corvin", status: "dead", deathChapter: 3 });
    addEvent({ name: "The Ambush", chapter: 8, occursInChapter: 8 });
    g.participatesIn.push({ char: "Corvin", event: "The Ambush" });
    const issues = await runConsistencyChecks(B);
    const flags = issuesOfType(issues, "dead_character_reappears");
    expect(flags).toHaveLength(1);
    expect(flags[0].chapters).toContain(8);
  });
});

// ─── Fix 6 / RC-5: timeline_violation is constructible on story-time ──────
describe("timeline_violation — story-time causal loop (Fix 6 / RC-5)", () => {
  it("DOES flag an effect-precedes-cause loop: ch8 event LEADS_TO a ch3 event (story-time)", async () => {
    addEvent({ name: "The Midnight Bargain", chapter: 8, occursInChapter: 8 });
    addEvent({ name: "Death of Corvin", chapter: 3, occursInChapter: 3 });
    g.leadsTo.push({ later: "The Midnight Bargain", earlier: "Death of Corvin" });
    const issues = await runConsistencyChecks(B);
    const flags = issuesOfType(issues, "timeline_violation");
    expect(flags).toHaveLength(1);
    expect(flags[0].chapters).toEqual([3, 8]);
  });

  it("does NOT flag legitimate cause→effect: ch3 event LEADS_TO a ch8 event", async () => {
    addEvent({ name: "The Spark", chapter: 3, occursInChapter: 3 });
    addEvent({ name: "The Fire", chapter: 8, occursInChapter: 8 });
    g.leadsTo.push({ later: "The Spark", earlier: "The Fire" });
    const issues = await runConsistencyChecks(B);
    expect(issuesOfType(issues, "timeline_violation")).toHaveLength(0);
  });
});

// ─── Fix 8 / RC-5: location_conflict corrected Cypher, sibling-aware ──────
// The check is GATED OFF by default (FP-B: it over-fires on ordinary intra-region
// travel). These tests exercise the CORRECTED Cypher directly by enabling the env
// flag (read at call time in runConsistencyChecks), then restore the prior value.
describe("location_conflict — sibling co-location (Fix 8 / RC-5 / D-32c)", () => {
  let prevFlag: string | undefined;
  beforeEach(() => {
    prevFlag = process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    process.env.ENABLE_LOCATION_CONFLICT_CHECK = "true";
  });
  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    else process.env.ENABLE_LOCATION_CONFLICT_CHECK = prevFlag;
  });

  it("DOES fire on the seeded ch7 pair: Mira at Salt Docks AND Cinder Ward (both PART_OF Emberfall)", async () => {
    addChar({ name: "Mira", status: "alive" });
    addLoc("Salt Docks", "Emberfall");
    addLoc("Cinder Ward", "Emberfall");
    addEvent({ name: "Grain Unloading", chapter: 7 });
    addEvent({ name: "Cinder Ward Raid", chapter: 7 });
    g.locatedAt.push({ event: "Grain Unloading", location: "Salt Docks" });
    g.locatedAt.push({ event: "Cinder Ward Raid", location: "Cinder Ward" });
    g.participatesIn.push({ char: "Mira", event: "Grain Unloading" });
    g.participatesIn.push({ char: "Mira", event: "Cinder Ward Raid" });
    const issues = await runConsistencyChecks(B);
    const flags = issuesOfType(issues, "location_conflict");
    expect(flags).toHaveLength(1);
    expect(flags[0].entities).toEqual(expect.arrayContaining(["Mira", "Salt Docks", "Cinder Ward"]));
  });

  it("does NOT fire on innocent movement between UNRELATED locations (Ashfall Gate / Cindermoor Bridge, no shared parent)", async () => {
    addChar({ name: "Mira", status: "alive" });
    addLoc("Ashfall Gate"); // no PART_OF
    addLoc("Cindermoor Bridge"); // no PART_OF
    addEvent({ name: "Rally", chapter: 3 });
    addEvent({ name: "Burial", chapter: 3 });
    g.locatedAt.push({ event: "Rally", location: "Ashfall Gate" });
    g.locatedAt.push({ event: "Burial", location: "Cindermoor Bridge" });
    g.participatesIn.push({ char: "Mira", event: "Rally" });
    g.participatesIn.push({ char: "Mira", event: "Burial" });
    const issues = await runConsistencyChecks(B);
    expect(issuesOfType(issues, "location_conflict")).toHaveLength(0);
  });

  it("does NOT fire on NESTED containment: at the Salt Docks AND at Emberfall (the docks are IN Emberfall)", async () => {
    addChar({ name: "Mira", status: "alive" });
    addLoc("Salt Docks", "Emberfall");
    addEvent({ name: "Docks Scene", chapter: 7 });
    addEvent({ name: "City Scene", chapter: 7 });
    g.locatedAt.push({ event: "Docks Scene", location: "Salt Docks" });
    g.locatedAt.push({ event: "City Scene", location: "Emberfall" });
    g.participatesIn.push({ char: "Mira", event: "Docks Scene" });
    g.participatesIn.push({ char: "Mira", event: "City Scene" });
    const issues = await runConsistencyChecks(B);
    expect(issuesOfType(issues, "location_conflict")).toHaveLength(0);
  });

  it("does NOT fire when the two sibling-location events are at DIFFERENT story-times (a flashback beat)", async () => {
    addChar({ name: "Mira", status: "alive" });
    addLoc("Salt Docks", "Emberfall");
    addLoc("Cinder Ward", "Emberfall");
    addEvent({ name: "Present Docks", chapter: 7, occursInChapter: 7 });
    addEvent({ name: "Flashback Ward", chapter: 7, occursInChapter: 2 });
    g.locatedAt.push({ event: "Present Docks", location: "Salt Docks" });
    g.locatedAt.push({ event: "Flashback Ward", location: "Cinder Ward" });
    g.participatesIn.push({ char: "Mira", event: "Present Docks" });
    g.participatesIn.push({ char: "Mira", event: "Flashback Ward" });
    const issues = await runConsistencyChecks(B);
    expect(issuesOfType(issues, "location_conflict")).toHaveLength(0);
  });
});

// ─── FP-B: location_conflict is GATED OFF by default ─────────────────────
describe("location_conflict default-OFF gate (FP-B)", () => {
  it("does NOT run by default (env unset) even on the seeded true-conflict topology", async () => {
    const prevFlag = process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
    try {
      addChar({ name: "Mira", status: "alive" });
      addLoc("Salt Docks", "Emberfall");
      addLoc("Cinder Ward", "Emberfall");
      addEvent({ name: "Grain Unloading", chapter: 7 });
      addEvent({ name: "Cinder Ward Raid", chapter: 7 });
      g.locatedAt.push({ event: "Grain Unloading", location: "Salt Docks" });
      g.locatedAt.push({ event: "Cinder Ward Raid", location: "Cinder Ward" });
      g.participatesIn.push({ char: "Mira", event: "Grain Unloading" });
      g.participatesIn.push({ char: "Mira", event: "Cinder Ward Raid" });
      const issues = await runConsistencyChecks(B);
      expect(issuesOfType(issues, "location_conflict")).toHaveLength(0);
    } finally {
      if (prevFlag === undefined) delete process.env.ENABLE_LOCATION_CONFLICT_CHECK;
      else process.env.ENABLE_LOCATION_CONFLICT_CHECK = prevFlag;
    }
  });
});

// ─── RC-6 B2: tenant guard on the detect read ────────────────────────────
describe("runConsistencyChecks tenant guard (RC-6 B2)", () => {
  it("excludes a node stamped with a DIFFERENT userId when a tenant is supplied", async () => {
    addChar({ name: "Corvin", status: "dead", deathChapter: 3, userId: "other-tenant" });
    addEvent({ name: "The Ambush", chapter: 8, occursInChapter: 8 });
    g.participatesIn.push({ char: "Corvin", event: "The Ambush" });
    // With the victim tenant, the foreign-owned node is filtered out → no flag.
    const scoped = await runConsistencyChecks(B, "victim-tenant");
    expect(issuesOfType(scoped, "dead_character_reappears")).toHaveLength(0);
    // Without a tenant (legacy call), bookId-only scope still sees it.
    const unscoped = await runConsistencyChecks(B);
    expect(issuesOfType(unscoped, "dead_character_reappears")).toHaveLength(1);
  });

  it("still returns a node with a MATCHING userId (and null-safe legacy nodes)", async () => {
    addChar({ name: "Corvin", status: "dead", deathChapter: 3, userId: "me" });
    addChar({ name: "Vera", status: "dead", deathChapter: 2 }); // legacy: no userId
    addEvent({ name: "E1", chapter: 8, occursInChapter: 8 });
    addEvent({ name: "E2", chapter: 8, occursInChapter: 8 });
    g.participatesIn.push({ char: "Corvin", event: "E1" });
    g.participatesIn.push({ char: "Vera", event: "E2" });
    const issues = await runConsistencyChecks(B, "me");
    const flagged = issuesOfType(issues, "dead_character_reappears").map((f) => f.entities[0]);
    expect(flagged).toEqual(expect.arrayContaining(["Corvin", "Vera"]));
  });
});
