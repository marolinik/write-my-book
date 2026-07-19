import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Sub-fix 7(b) / D-32a regression: role, status, and description must NOT be
 * blanket-overwritten by every stochastic re-extraction.
 *
 * Root cause: upsertSingleEntity built one `allProps` map and applied it as
 * `ON MATCH SET n += $updateProps`, so a single scan emitting status:"transformed"
 * overwrote a prior status:"dead". The dead_character_reappears check
 * (graph-queries.ts) gates on the literal `c.status = "dead"`, so the check
 * silently disarmed until a lucky later scan re-asserted "dead" (the D1 driver).
 * Same class of churn hit role and description.
 *
 * Fix: status `dead` is a STICKY terminal state; role/description are
 * preserve-first-non-empty. Everything else keeps `+= $updateProps`.
 *
 * The fake Neo4j session below mirrors real MERGE semantics precisely — ON
 * CREATE applies $createProps, ON MATCH applies $updateProps then the
 * query-text-driven stable/monotonic clauses — so create-vs-match behaviour is
 * exercised for real, not masked by substring-only emulation.
 */

type Params = Record<string, unknown>;
type NodeProps = Record<string, unknown>;

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  store: new Map<string, NodeProps>(),
}));

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });

        const merge = query.match(
          /MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/
        );
        if (merge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          const label = merge[1];
          const key = `${label}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.store.get(key);

          let merged: NodeProps;
          if (!existing) {
            // ON CREATE SET n += $createProps, ..., n.firstAppearance = $chapter
            merged = {
              ...(params.createProps as Params),
              firstAppearance: params.chapter,
            };
          } else {
            // ON MATCH SET n += $updateProps [, <stable / monotonic items>]
            merged = { ...existing, ...(params.updateProps as Params) };

            // status: `dead` is sticky for Characters (sub-fix b) — a later
            // stochastic scan cannot downgrade it. D-80 authoritative writes and
            // D-81 non-Character labels emit a plain `n.status = $incomingStatus`
            // (latest-wins) instead of the sticky CASE.
            if (
              query.includes(
                'n.status = CASE WHEN n.status = "dead" THEN n.status ELSE $incomingStatus END'
              )
            ) {
              merged.status =
                existing.status === "dead" ? existing.status : params.incomingStatus;
            } else if (query.includes("n.status = $incomingStatus")) {
              merged.status = params.incomingStatus;
            }

            // role: preserve-first-non-empty (sub-fix b). The 'mentioned'
            // placeholder is empty-equivalent when the clause opts in (the
            // optional capture group). D-80 authoritative writes instead emit a
            // plain `n.role = $incomingRole` (direct overwrite).
            const roleCase = query.match(
              /n\.role = CASE WHEN n\.role IS NULL OR n\.role = ""( OR n\.role = "mentioned")? THEN \$incomingRole ELSE n\.role END/
            );
            if (roleCase) {
              const mentionedIsEmpty = Boolean(roleCase[1]);
              const roleEmpty =
                existing.role == null ||
                existing.role === "" ||
                (mentionedIsEmpty && existing.role === "mentioned");
              merged.role = roleEmpty ? params.incomingRole : existing.role;
            } else if (query.includes("n.role = $incomingRole")) {
              merged.role = params.incomingRole;
            }

            // description: preserve-first-non-empty (bounded, no append churn).
            // D-80 authoritative writes emit a plain `n.description = $incomingDescription`.
            if (
              query.includes(
                'n.description = CASE WHEN n.description IS NULL OR n.description = "" THEN $incomingDescription ELSE n.description END'
              )
            ) {
              merged.description =
                existing.description == null || existing.description === ""
                  ? params.incomingDescription
                  : existing.description;
            } else if (query.includes("n.description = $incomingDescription")) {
              merged.description = params.incomingDescription;
            }

            // deathChapter: RC-2 first-write-wins (must stay intact); a D-80
            // authoritative move away from "dead" retires the anchor via `= null`.
            if (query.includes("n.deathChapter = coalesce(n.deathChapter, $chapter)")) {
              merged.deathChapter = existing.deathChapter ?? params.chapter;
            } else if (query.includes("n.deathChapter = null")) {
              merged.deathChapter = null;
            }
          }

          h.store.set(key, merged);
          return {
            records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }],
          };
        }

        // alias-lookup / any other read: no matches
        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import { upsertEntities } from "@/lib/graph/graph-builder";
import type { ExtractionResult, GraphNodeLabel } from "@/lib/graph/types";

const mergeCalls = () =>
  h.calls.filter((c) => c.query.includes("RETURN n.createdAt = n.updatedAt AS isNew"));

const node = (key: string): NodeProps => {
  const n = h.store.get(key);
  if (!n) throw new Error(`node ${key} not found`);
  return n;
};

/** Replicates the dead_character_reappears gate (graph-queries.ts:440). */
const deadGateArmed = (n: NodeProps): boolean =>
  n.status === "dead" && n.deathChapter !== undefined && n.deathChapter !== null;

function extraction(over: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    bookId: "b1",
    entities: [],
    relationships: [],
    chapterNumber: 7,
    contentHash: "0000000000000000",
    ...over,
  };
}

const character = (
  name: string,
  properties: Record<string, unknown>
): { name: string; label: GraphNodeLabel; properties: Record<string, unknown> } => ({
  name,
  label: "Character",
  properties: { bookId: "b1", ...properties },
});

const entity = (
  name: string,
  label: GraphNodeLabel,
  properties: Record<string, unknown>
): { name: string; label: GraphNodeLabel; properties: Record<string, unknown> } => ({
  name,
  label,
  properties: { bookId: "b1", ...properties },
});

beforeEach(() => {
  h.calls.length = 0;
  h.store.clear();
});

describe("upsertEntities sub-fix 7(b): sticky/monotonic continuity properties (D-32a)", () => {
  it("(b1) status:dead SURVIVES a later 'transformed' scan — dead_character_reappears stays armed without a lucky re-arm", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 4, entities: [character("Corvin", { status: "dead", role: "supporting" })] })
    ); // CREATE dead → deathChapter 4
    await upsertEntities(
      extraction({ chapterNumber: 7, entities: [character("Corvin", { status: "transformed", role: "supporting" })] })
    ); // MATCH: stochastic downgrade attempt

    const n = node("Character:b1:Corvin");
    expect(n.status).toBe("dead"); // NOT "transformed"
    expect(n.deathChapter).toBe(4);
    expect(deadGateArmed(n)).toBe(true);

    // The downgrading scan must NOT carry status in the blanket merge map.
    const secondMerge = mergeCalls()[1];
    expect((secondMerge.params.updateProps as Params).status).toBeUndefined();
    expect(secondMerge.query).toContain(
      'n.status = CASE WHEN n.status = "dead" THEN n.status ELSE $incomingStatus END'
    );
  });

  it("(b1') dead also survives an 'alive' scan (resurrection churn cannot disarm the gate)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 4, entities: [character("Mara", { status: "dead" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 9, entities: [character("Mara", { status: "alive" })] })
    );
    expect(node("Character:b1:Mara").status).toBe("dead");
    expect(deadGateArmed(node("Character:b1:Mara"))).toBe(true);
  });

  it("(b2) a genuine FIRST-TIME death still lands: alive→dead adopts 'dead' and stamps deathChapter", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 2, entities: [character("Vera", { status: "alive" })] })
    ); // CREATE alive → no deathChapter
    await upsertEntities(
      extraction({ chapterNumber: 6, entities: [character("Vera", { status: "dead" })] })
    ); // MATCH: first real death

    const n = node("Character:b1:Vera");
    expect(n.status).toBe("dead");
    expect(n.deathChapter).toBe(6);
    expect(deadGateArmed(n)).toBe(true);
  });

  it("(b2') a Character introduced already-dead on ON CREATE (posthumous) lands dead", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [character("Halden", { status: "dead" })] })
    );
    const n = node("Character:b1:Halden");
    expect(n.status).toBe("dead");
    expect(n.deathChapter).toBe(5);
    // create path still carries deathChapter coalesce semantics (RC-2 intact)
    expect(mergeCalls()[0].query).toContain("n.deathChapter = coalesce(n.deathChapter, $chapter)");
  });

  it("(b2'') non-dead status still updates freely between non-terminal values (alive→unknown)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [character("Perry", { status: "alive" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [character("Perry", { status: "unknown" })] })
    );
    // Only "dead" is frozen; ordinary status tracking is preserved.
    expect(node("Character:b1:Perry").status).toBe("unknown");
  });

  it("(b3) role is preserve-first-non-empty: a later 'minor' scan cannot overwrite an established 'protagonist'", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 1, entities: [character("Sela", { role: "protagonist", status: "alive" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [character("Sela", { role: "minor", status: "alive" })] })
    );
    expect(node("Character:b1:Sela").role).toBe("protagonist");
  });

  it("(b3') role backfills when the first scan omitted it (fills empty, then sticks)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 1, entities: [character("Otto", { status: "alive" })] })
    ); // no role
    await upsertEntities(
      extraction({ chapterNumber: 2, entities: [character("Otto", { role: "supporting", status: "alive" })] })
    );
    expect(node("Character:b1:Otto").role).toBe("supporting");
  });

  it("(b4) description is preserve-first-non-empty (no signature churn across re-scans)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 1, entities: [character("Ivo", { description: "A tall knight.", status: "alive" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [character("Ivo", { description: "A weary, older man.", status: "alive" })] })
    );
    expect(node("Character:b1:Ivo").description).toBe("A tall knight.");
  });

  it("(b5) role/status/description are pulled OUT of the blanket += $updateProps map, but written on ON CREATE and refresh fields remain", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 8,
        entities: [character("Rhea", { status: "dead", role: "antagonist", description: "The rival queen." })],
      })
    );
    const merge = mergeCalls()[0];
    const createProps = merge.params.createProps as Params;
    const updateProps = merge.params.updateProps as Params;

    // written on ON CREATE
    expect(createProps.status).toBe("dead");
    expect(createProps.role).toBe("antagonist");
    expect(createProps.description).toBe("The rival queen.");

    // NOT in the blanket merge map (so a later scan can't blanket-overwrite them)
    expect(updateProps.status).toBeUndefined();
    expect(updateProps.role).toBeUndefined();
    expect(updateProps.description).toBeUndefined();

    // refresh fields still merge on every scan
    expect(updateProps.lastMentioned).toBe(8);
    expect(updateProps.contentHash).toBe("0000000000000000");
    expect(updateProps.updatedAt).toBeDefined();
  });

  it("(b6) new fields flow through Cypher params, not string interpolation (injection boundary intact)", async () => {
    const malicious = 'dead"}) DETACH DELETE n //';
    await upsertEntities(
      extraction({ chapterNumber: 4, entities: [character("Zed", { status: malicious })] })
    );
    const merge = mergeCalls()[0];
    // label MERGE key stays parameterized/escaped; value rides as a param
    expect(merge.query).toContain("MERGE (n:Character {bookId: $bookId, name: $name})");
    expect(merge.query).toContain("$incomingStatus");
    expect(merge.query).not.toContain("DETACH DELETE");
    expect((merge.params as Params).incomingStatus).toBe(malicious);
  });

  it("(b7) re-running the identical dead scan is idempotent — status/description do not churn", async () => {
    const scan = () =>
      upsertEntities(
        extraction({ chapterNumber: 4, entities: [character("Cyra", { status: "dead", description: "A quiet archivist." })] })
      );
    await scan();
    await scan();
    const n = node("Character:b1:Cyra");
    expect(n.status).toBe("dead");
    expect(n.description).toBe("A quiet archivist.");
    expect(n.deathChapter).toBe(4);
  });

  // ── D-81: sticky-dead is Character-only ──────────────────────────────────
  // Pre-fix the sticky CASE was appended for EVERY label, so a PlotThread/Object
  // erroneously scanned status:"dead" froze forever — silently exiting its own
  // gates (orphan_plot_thread reads `status IN ["introduced","developing"]`) and
  // never resolvable. No false flag, but a silent miss. Fix: apply the sticky
  // CASE only when label === "Character"; other labels keep plain latest-wins.
  it("(b8/D-81) sticky-dead does NOT apply to a PlotThread — a mis-scanned 'dead' is correctable (latest-wins)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 2, entities: [entity("The Prophecy", "PlotThread", { status: "dead" })] })
    ); // CREATE with an erroneous 'dead'
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [entity("The Prophecy", "PlotThread", { status: "developing" })] })
    ); // MATCH: the correction must land
    expect(node("PlotThread:b1:The Prophecy").status).toBe("developing");

    // the sticky CASE must NOT be emitted for a non-Character label
    const secondMerge = mergeCalls()[1];
    expect(secondMerge.query).not.toContain('n.status = CASE WHEN n.status = "dead"');
    expect(secondMerge.query).toContain("n.status = $incomingStatus");
  });

  it("(b8') Object status still tracks latest-wins (destroyed→intact) — unaffected by Character stickiness", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [entity("The Sword", "Object", { status: "destroyed" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 6, entities: [entity("The Sword", "Object", { status: "intact" })] })
    );
    expect(node("Object:b1:The Sword").status).toBe("intact");
  });

  // ── character_undocumented role-freeze: 'mentioned' is empty-equivalent ────
  // The character_undocumented check gates on `c.role = "mentioned"`. Preserving
  // the placeholder 'mentioned' as if it were a real role would keep the flag
  // firing forever; treating it as empty-equivalent lets a later documented role
  // upgrade land (while a real role stays preserve-first, per b3).
  it("(b9/'mentioned') role placeholder 'mentioned' is empty-equivalent: a documented role upgrade lands", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 1, entities: [character("Bram", { role: "mentioned", status: "alive" })] })
    ); // first scan only knew the placeholder role
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [character("Bram", { role: "advisor", status: "alive" })] })
    ); // documented role now known — must upgrade
    expect(node("Character:b1:Bram").role).toBe("advisor");
  });

  it("(b9') a REAL established role is still preserve-first (not treated as 'mentioned')", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 1, entities: [character("Lyle", { role: "protagonist", status: "alive" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [character("Lyle", { role: "mentioned", status: "alive" })] })
    ); // a later scan degrading to the placeholder must NOT overwrite a real role
    expect(node("Character:b1:Lyle").role).toBe("protagonist");
  });
});

// ── D-80: authoritative writes (UpdateGraphEntity) land deliberate corrections ─
// Sub-fix (b) makes dead sticky and role/description preserve-first against
// STOCHASTIC re-extraction. A DELIBERATE user/agent correction via
// UpdateGraphEntity must NOT be silently no-op'd (failure-states-lie). The
// `authoritative` flag (default false) bypasses the sticky/preserve clauses so
// the edit lands; stochastic callers omit it and stay sticky.
describe("upsertEntities D-80: authoritative writes override sticky/preserve-first", () => {
  it("(d80-1) authoritative dead→alive LANDS, overwrites role/description, and retires the death anchor", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [character("Corvin", { status: "dead", role: "villain", description: "A grim warlord." })],
      })
    ); // stochastic CREATE → dead, deathChapter 4
    await upsertEntities(
      extraction({
        chapterNumber: 7,
        entities: [character("Corvin", { status: "alive", role: "ally", description: "Redeemed and living." })],
      }),
      true // authoritative UpdateGraphEntity correction
    );
    const n = node("Character:b1:Corvin");
    expect(n.status).toBe("alive"); // correction landed (NOT sticky-dead)
    expect(n.role).toBe("ally"); // authoritative overwrite (NOT preserve-first)
    expect(n.description).toBe("Redeemed and living.");
    expect(n.deathChapter == null).toBe(true); // anchor retired
    expect(deadGateArmed(n)).toBe(false); // the deliberate edit disarms the gate

    const authMerge = mergeCalls()[1];
    expect(authMerge.query).toContain("n.status = $incomingStatus");
    expect(authMerge.query).not.toContain('n.status = CASE WHEN n.status = "dead"');
    // value still rides as a param — injection boundary unchanged
    expect((authMerge.params as Params).incomingStatus).toBe("alive");
  });

  it("(d80-2) stochastic re-extraction (default authoritative=false) still CANNOT resurrect — sub-fix (b) intact", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 4, entities: [character("Mira", { status: "dead", role: "queen" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 7, entities: [character("Mira", { status: "alive", role: "peasant" })] })
    ); // default false → sticky
    const n = node("Character:b1:Mira");
    expect(n.status).toBe("dead"); // still sticky
    expect(n.role).toBe("queen"); // still preserve-first
    expect(deadGateArmed(n)).toBe(true);
  });

  it("(d80-3) an authoritative status change to a NEW dead still stamps deathChapter (first-death anchor)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 2, entities: [character("Odo", { status: "alive" })] })
    );
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [character("Odo", { status: "dead" })] }),
      true // deliberately marking dead
    );
    const n = node("Character:b1:Odo");
    expect(n.status).toBe("dead");
    expect(n.deathChapter).toBe(5);
    expect(deadGateArmed(n)).toBe(true);
  });
});
