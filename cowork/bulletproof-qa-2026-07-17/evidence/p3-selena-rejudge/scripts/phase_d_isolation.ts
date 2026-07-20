/**
 * Phase D — D-30 cross-tenant / cross-book isolation.
 *
 * Setup: a DIFFERENT user (P4) owns a standalone "victim" book containing the
 * SAME-NAMED character pair as P3's book1 (Kira Venn + Vael Thorne), asserted as
 * ALLIES. P3's book1 asserts OPPOSES between the same names. Under the OLD D-30
 * bug (name-only relationship MATCH) a P3 OPPOSES write would contaminate the
 * victim book → a FALSE relationship_contradiction in a book P4 never touched.
 *
 * Test: (1) seed+extract victim as P4; snapshot victim edges. (2) as P3, write a
 * NEW book1 chapter re-asserting OPPOSES(Kira,Vael) AFTER the victim exists and
 * extract it. (3) re-snapshot victim → must be byte-identical (no OPPOSES leaked)
 * and runConsistencyChecks(victim,P4) must show NO relationship_contradiction.
 */
import { db } from "@/lib/db";
import { withSession } from "@/lib/graph/neo4j-client";
import { runConsistencyChecks } from "@/lib/graph/graph-queries";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { getExtractionKeysForUser } from "@/lib/agents/extraction-keys";
import { call, loadState, saveState, writeNeo, log, RUN_TAG } from "./_lib";

const P4 = "user_qa_p4";
const P3 = "user_qa_p3";

const VICTIM_NAME = `P4 Victim Book [${RUN_TAG}]`;
const VICTIM_CH1 = `Chapter One — The Northern Accord

In the northern hold of Frostmere, Kira Venn and Vael Thorne stood together as the closest of allies. Kira Venn and Vael Thorne were allied, sworn friends bound by the Northern Accord. Vael Thorne pledged his sword to Kira Venn; the two were allies in all things, shoulder to shoulder against the long northern cold. There was no quarrel between Kira Venn and Vael Thorne — only the Accord.`;

const BOOK1_CH7 = `Chapter Seven — Blades Drawn Again

Once more in the halls of Highfort, Vael Thorne turned against Kira Venn. Vael Thorne opposed Kira Venn openly; Vael Thorne stood against Kira Venn as her sworn enemy in the ruin of the Pact. Kira Venn and Vael Thorne drew blades against one another, enemies now in truth. Vael Thorne opposes Kira Venn.`;

async function edgeSnapshot(bookId: string): Promise<any> {
  return withSession("READ", async (s) => {
    const r = await s.run(
      `MATCH (ca:Character {bookId:$b})-[r:ALLIED_WITH|OPPOSES]-(cb:Character {bookId:$b})
       WHERE id(ca)<id(cb)
       RETURN ca.name AS fromName, type(r) AS t, cb.name AS toName, r.chapter AS ch, r.userId AS uid
       ORDER BY fromName, toName, t`,
      { b: bookId }
    );
    return r.records.map((rec) => ({
      a: rec.get("fromName"), t: rec.get("t"), b: rec.get("toName"),
      ch: rec.get("ch")?.toNumber?.() ?? rec.get("ch"), uid: rec.get("uid"),
    }));
  });
}

async function crossBookEdgeCheck(bookA: string, bookB: string): Promise<number> {
  return withSession("READ", async (s) => {
    const r = await s.run(
      `MATCH (x {bookId:$a})-[r]-(y {bookId:$b}) RETURN count(r) AS c`,
      { a: bookA, b: bookB }
    );
    return r.records[0].get("c").toNumber();
  });
}

async function main() {
  const state = loadState();
  const p4 = await db.user.findUnique({ where: { clerkId: P4 } });
  const p3 = await db.user.findUnique({ where: { clerkId: P3 } });
  if (!p4 || !p3) throw new Error("missing users");

  log("=== PHASE D: D-30 CROSS-TENANT ISOLATION ===");

  // 1. Create victim book as P4 (standalone) + save ch1.
  let victimId = state.victimBookId;
  let victimCh1Id = state.victimCh1Id;
  if (!victimId) {
    const vb = await call("POST", "/api/books", P4, { name: VICTIM_NAME, genre: "fantasy" }, "40_p4_create_victim_book");
    if (vb.status !== 201) throw new Error("victim create failed: " + JSON.stringify(vb.body));
    victimId = (vb.body as any).id;
    victimCh1Id = (vb.body as any).firstChapterId;
    state.victimBookId = victimId;
    state.victimCh1Id = victimCh1Id;
    saveState(state);
    await call("PUT", `/api/books/${victimId}/chapters/${victimCh1Id}/content`, P4,
      { markdown: VICTIM_CH1, changeSource: "user" }, "41_p4_put_victim_ch1");
  }
  log("victim book:", victimId);

  // 2. Extract victim ch1 as P4 (P4's own keys).
  const p4keys = await getExtractionKeysForUser(p4.id);
  const vEnv = await updateFromChapter(victimId, 1, VICTIM_CH1, p4.defaultModel ?? undefined, p4keys, p4.id);
  log("victim extraction:", JSON.stringify(vEnv));

  const victimBefore = await edgeSnapshot(victimId);
  log("victim edges BEFORE P3 write:", JSON.stringify(victimBefore));

  // 3. As P3, write+extract a NEW book1 chapter re-asserting OPPOSES AFTER victim exists.
  let ch7Id = state.book1Chapters["7"];
  if (!ch7Id) {
    const c = await call("POST", `/api/books/${state.book1Id}/chapters`, P3, { actNumber: 1, chapterNumber: 7 }, "42_p3_create_book1_ch7");
    ch7Id = (c.body as any).id;
    state.book1Chapters["7"] = ch7Id;
    saveState(state);
    await call("PUT", `/api/books/${state.book1Id}/chapters/${ch7Id}/content`, P3,
      { markdown: BOOK1_CH7, changeSource: "user" }, "43_p3_put_book1_ch7");
  }
  const p3keys = await getExtractionKeysForUser(p3.id);
  const p3Env = await updateFromChapter(state.book1Id, 7, BOOK1_CH7, p3.defaultModel ?? undefined, p3keys, p3.id);
  log("P3 book1 ch7 (OPPOSES) extraction:", JSON.stringify(p3Env));

  // 4. Re-snapshot victim → must be UNCHANGED.
  const victimAfter = await edgeSnapshot(victimId);
  const b1edges = await edgeSnapshot(state.book1Id);
  const crossCount = await crossBookEdgeCheck(state.book1Id, victimId);
  const victimIssues = await runConsistencyChecks(victimId, p4.id);
  const victimContradictions = victimIssues.filter((i) => i.type === "relationship_contradiction");

  let out = `=== D-30 CROSS-TENANT ISOLATION EVIDENCE ===\ncaptured: ${new Date().toISOString()}\n\n`;
  out += `P3 id=${p3.id}  book1=${state.book1Id}\nP4 id=${p4.id}  victimBook=${victimId}\n\n`;
  out += `victim extraction envelope: ${JSON.stringify(vEnv)}\n`;
  out += `P3 book1 ch7 OPPOSES-write envelope: ${JSON.stringify(p3Env)}\n\n`;
  out += `--- VICTIM (P4) Kira<->Vael edges BEFORE P3 write ---\n${JSON.stringify(victimBefore, null, 2)}\n\n`;
  out += `--- VICTIM (P4) Kira<->Vael edges AFTER P3 write ---\n${JSON.stringify(victimAfter, null, 2)}\n\n`;
  out += `UNCHANGED? ${JSON.stringify(victimBefore) === JSON.stringify(victimAfter) ? "YES — no leak" : "NO — CONTAMINATION"}\n`;
  out += `victim OPPOSES edge count: ${victimAfter.filter((e: any) => e.t === "OPPOSES").length} (expect 0)\n\n`;
  out += `--- P3 BOOK1 Kira<->Vael edges (owns its own OPPOSES/ALLIED) ---\n${JSON.stringify(b1edges, null, 2)}\n\n`;
  out += `cross-book edges between book1 and victim (any direction): ${crossCount} (expect 0)\n\n`;
  out += `runConsistencyChecks(victim, P4) → ${victimIssues.length} issue(s); relationship_contradiction count = ${victimContradictions.length} (expect 0)\n`;
  for (const i of victimIssues) out += `   [${i.severity}] ${i.type}: ${i.description}\n`;

  out += `\nVERDICT D-30: ${
    victimAfter.filter((e: any) => e.t === "OPPOSES").length === 0 &&
    crossCount === 0 &&
    victimContradictions.length === 0 &&
    JSON.stringify(victimBefore) === JSON.stringify(victimAfter)
      ? "PASS — P3's write did NOT reach P4's book; no false contradiction; no cross-book edges."
      : "FAIL — see above."
  }\n`;

  writeNeo("03_d30_isolation.txt", out);
  log(out);
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE D ERROR:", e);
  process.exit(1);
});
