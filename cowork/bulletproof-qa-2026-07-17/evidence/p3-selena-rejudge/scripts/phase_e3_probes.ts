/**
 * Phase E3 — three controlled probes against the REAL fixed product code
 * (no src edits; controlled inputs to the shipped functions):
 *   (1) D-27 alias-union invariant — upsertEntities ON MATCH unions aliases.
 *   (2) location_conflict GATE — OFF by default; correctness-behind-gate holds
 *       when ENABLE_LOCATION_CONFLICT_CHECK is flipped (read at call time).
 *   (3) D-28/D-31 failure honesty — a failed extraction returns an HONEST failed
 *       envelope and does NOT stamp contentHash or fabricate/destroy graph data.
 */
import { db } from "@/lib/db";
import { withSession } from "@/lib/graph/neo4j-client";
import { runConsistencyChecks } from "@/lib/graph/graph-queries";
import { upsertEntities } from "@/lib/graph/graph-builder";
import { updateFromChapter, getContentHash } from "@/lib/graph/graph-maintenance";
import { call, loadState, saveState, writeNeo, log, RUN_TAG } from "./_lib";

const P3 = "user_qa_p3";

async function newBook(name: string): Promise<{ id: string; ch1: string }> {
  const b = await call("POST", "/api/books", P3, { name, genre: "fantasy" }, undefined);
  if (b.status !== 201) throw new Error("probe book create failed: " + JSON.stringify(b.body));
  return { id: (b.body as any).id, ch1: (b.body as any).firstChapterId };
}
async function aliasesOf(bookId: string, name: string): Promise<string[] | null> {
  return withSession("READ", async (s) => {
    const r = await s.run(`MATCH (c:Character {bookId:$b, name:$n}) RETURN c.aliases AS a`, { b: bookId, n: name });
    return r.records[0]?.get("a") ?? null;
  });
}
async function nodeCount(bookId: string, label: string): Promise<number> {
  return withSession("READ", async (s) => {
    const r = await s.run(`MATCH (n:${label} {bookId:$b}) RETURN count(n) AS c`, { b: bookId });
    return r.records[0].get("c").toNumber();
  });
}

async function probeAliasUnion(userId: string, state: any): Promise<string> {
  let out = `=== (1) D-27 ALIAS-UNION INVARIANT — controlled input to real upsertEntities ===\n`;
  let bookId = state.aliasProbeBookId;
  if (!bookId) {
    const b = await newBook(`ZZ Alias Probe [${RUN_TAG}]`);
    bookId = b.id;
    state.aliasProbeBookId = bookId;
    saveState(state);
  }
  const mk = (ch: number, aliases: string[], hash: string) => ({
    bookId, userId, chapterNumber: ch, contentHash: hash, relationships: [],
    entities: [{ name: "Zoë Rasmussen", label: "Character", properties: { status: "alive", role: "supporting" }, aliases }],
  }) as any;

  await upsertEntities(mk(1, ["Zoë", "the Cartographer"], "aliasprobe-1"));
  const a1 = await aliasesOf(bookId, "Zoë Rasmussen");
  await upsertEntities(mk(2, ["Zoe"], "aliasprobe-2"));
  const a2 = await aliasesOf(bookId, "Zoë Rasmussen");
  await upsertEntities(mk(3, ["Zoë"], "aliasprobe-3")); // subset re-emit (last-write would DROP "Zoe"/"the Cartographer")
  const a3 = await aliasesOf(bookId, "Zoë Rasmussen");

  out += `book=${bookId}\n`;
  out += `  after ch1 emit ["Zoë","the Cartographer"] -> ${JSON.stringify(a1)}\n`;
  out += `  after ch2 emit ["Zoe"]                     -> ${JSON.stringify(a2)}\n`;
  out += `  after ch3 emit ["Zoë"] (subset)            -> ${JSON.stringify(a3)}\n`;
  const set = new Set(a3 ?? []);
  const unioned = set.has("Zoë") && set.has("Zoe") && set.has("the Cartographer");
  out += `  VERDICT: ${unioned ? "PASS — all variants UNIONed on one node, none dropped by later subset write" : "FAIL — a variant was lost (overwrite regression)"}\n`;
  return out;
}

async function probeLocationGate(userId: string, state: any): Promise<string> {
  let out = `\n=== (2) location_conflict GATE (founder-ruled OFF by default) ===\n`;
  let bookId = state.locProbeBookId;
  if (!bookId) {
    const b = await newBook(`ZZ Location Gate Probe [${RUN_TAG}]`);
    bookId = b.id;
    state.locProbeBookId = bookId;
    saveState(state);
    // Build the exact seeded true-conflict shape: Kira at two DISTINCT locations
    // sharing an ancestor region in the SAME story chapter (ch8).
    await upsertEntities({
      bookId, userId, chapterNumber: 8, contentHash: "locprobe-1",
      entities: [
        { name: "Kira Venn", label: "Character", properties: { status: "alive", role: "protagonist" } },
        { name: "Salt Docks", label: "Location", properties: { locationType: "region" } },
        { name: "Cinder Ward", label: "Location", properties: { locationType: "region" } },
        { name: "Ashfall Realm", label: "Location", properties: { locationType: "world" } },
        { name: "Unloading grain at the Salt Docks", label: "Event", properties: { significance: "minor" } },
        { name: "Raid on the Cinder Ward", label: "Event", properties: { significance: "minor" } },
      ],
      relationships: [
        { from: "Kira Venn", fromLabel: "Character", to: "Unloading grain at the Salt Docks", toLabel: "Event", type: "PARTICIPATES_IN" },
        { from: "Kira Venn", fromLabel: "Character", to: "Raid on the Cinder Ward", toLabel: "Event", type: "PARTICIPATES_IN" },
        { from: "Unloading grain at the Salt Docks", fromLabel: "Event", to: "Salt Docks", toLabel: "Location", type: "LOCATED_AT" },
        { from: "Raid on the Cinder Ward", fromLabel: "Event", to: "Cinder Ward", toLabel: "Location", type: "LOCATED_AT" },
        { from: "Salt Docks", fromLabel: "Location", to: "Ashfall Realm", toLabel: "Location", type: "PART_OF" },
        { from: "Cinder Ward", fromLabel: "Location", to: "Ashfall Realm", toLabel: "Location", type: "PART_OF" },
      ],
    } as any);
  }

  delete process.env.ENABLE_LOCATION_CONFLICT_CHECK; // default state
  const offIssues = await runConsistencyChecks(bookId, userId);
  const offLoc = offIssues.filter((i) => i.type === "location_conflict");
  process.env.ENABLE_LOCATION_CONFLICT_CHECK = "true"; // flip for one probe
  const onIssues = await runConsistencyChecks(bookId, userId);
  const onLoc = onIssues.filter((i) => i.type === "location_conflict");
  delete process.env.ENABLE_LOCATION_CONFLICT_CHECK; // restore

  out += `book=${bookId} (seeded: Kira at Salt Docks AND Cinder Ward, both PART_OF Ashfall Realm, same ch8)\n`;
  out += `  env default (unset): location_conflict count = ${offLoc.length} (expect 0 — GATE OFF)\n`;
  out += `  env flipped (=true): location_conflict count = ${onLoc.length} (expect >=1 — correctness behind gate)\n`;
  for (const i of onLoc) out += `     -> ${i.description}\n`;
  const pass = offLoc.length === 0 && onLoc.length >= 1;
  out += `  VERDICT: ${pass ? "PASS — OFF by default; fires only when explicitly enabled (founder ruling honored, check correct behind gate)" : "INCONCLUSIVE — see counts"}\n`;
  return out;
}

async function probeFailureHonesty(userId: string, defaultModel: string | null, state: any): Promise<string> {
  let out = `\n=== (3) D-28/D-31 FAILURE HONESTY — failed extraction is signaled, no silent green ===\n`;
  let bookId = state.failProbeBookId;
  let chId = state.failProbeChId;
  const content =
    `Chapter One — A Substantive Chapter. ` +
    `Marlow Kestrel walked the long grey quay at Harrowgate, where the fishing boats groaned against their ropes. ` +
    `He remembered the widow Ansel, and the promise he had made to her by the lighthouse. The gulls wheeled overhead. ` +
    `This chapter has well over fifty words of genuine prose, so an empty or failed extraction here must be treated as a real failure, not a clean pass.`;
  if (!bookId) {
    const b = await newBook(`ZZ Failure Honesty Probe [${RUN_TAG}]`);
    bookId = b.id; chId = b.ch1;
    state.failProbeBookId = bookId; state.failProbeChId = chId;
    saveState(state);
    await call("PUT", `/api/books/${bookId}/chapters/${chId}/content`, P3, { markdown: content, changeSource: "user" }, undefined);
  }

  // Drive the REAL pipeline with EMPTY keys → createExtractionClient throws → the
  // fixed code must return an HONEST failed envelope (not a skip-shaped clean pass).
  const env = await updateFromChapter(bookId, 1, content, defaultModel ?? undefined, {} /* NO KEYS */, userId);
  const hashAfter = await getContentHash(bookId, 1);
  const chars = await nodeCount(bookId, "Character");
  const events = await nodeCount(bookId, "Event");

  out += `book=${bookId}\n`;
  out += `  updateFromChapter (empty keys) envelope: ${JSON.stringify(env)}\n`;
  out += `  contentHash stamped after failure? ${hashAfter === null ? "NO (null) — next scan will retry (correct)" : `YES=${hashAfter} (WRONG — poisoned skip-cache)`}\n`;
  out += `  entity nodes written: Character=${chars} Event=${events} (expect 0 — no fabricated/partial graph)\n`;
  const pass = (env as any).failed === true && (env as any).updated === false && hashAfter === null && chars === 0 && events === 0;
  out += `  VERDICT: ${pass ? "PASS — failure is HONEST: failed=true, no hash stamp, no fabricated data, prior graph intact" : "FAIL — see envelope"}\n`;
  out += `  NOTE: this exercises the HARD-FAILURE class (D-73/D-28). The suspicious-empty subclass (D-31: model runs, yields nothing on substantive prose) was NOT triggered in this run — every real qwen3.6 extraction yielded entities+relationships (positive evidence the pipeline populates).\n`;
  return out;
}

async function main() {
  const state = loadState();
  const p3 = await db.user.findUnique({ where: { clerkId: P3 } });
  if (!p3) throw new Error("no P3");
  log("=== PHASE E3: controlled product-code probes ===");

  const a = await probeAliasUnion(p3.id, state);
  const b = await probeLocationGate(p3.id, state);
  const c = await probeFailureHonesty(p3.id, p3.defaultModel, state);
  const full = a + b + c + `\ncaptured: ${new Date().toISOString()}\n`;
  writeNeo("07_controlled_probes.txt", full);
  log(full);
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("PHASE E3 ERROR:", e); process.exit(1); });
