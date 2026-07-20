/**
 * Phase E2 — persist relationship_contradiction through the LIVE HTTP path.
 *
 * Context: Phase C proved relationship_contradiction FIRES (runConsistencyChecks
 * returned it at ch5). Phase D's ch7 OPPOSES re-assertion then MERGE-overwrote the
 * Kira↔Vael OPPOSES edge's .chapter (5→7), so ALLIED_WITH(ch5) and OPPOSES(ch7) no
 * longer share a chapter — the check correctly stops firing (an EVOLVING
 * relationship is not a contradiction). To persist a clean same-chapter
 * co-assertion through the endpoint, ch8 asserts BOTH allied AND opposed for the
 * same pair in ONE chapter, moving both edges to ch8 together.
 */
import { db } from "@/lib/db";
import { withSession } from "@/lib/graph/neo4j-client";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { getExtractionKeysForUser } from "@/lib/agents/extraction-keys";
import { call, loadState, saveState, writeNeo, log } from "./_lib";

const P3 = "user_qa_p3";
const CH8 = `Chapter Eight — Allied and Opposed

In the final reckoning at Highfort, Kira Venn and Vael Thorne stood allied and opposed at the very same hour. By the old oath Kira Venn and Vael Thorne were still allies, bound and allied before the court; yet in that same hour Vael Thorne opposed Kira Venn and stood against her as an enemy. Kira Venn and Vael Thorne were allied and opposed in one and the same moment — allies who opposed each other.`;

async function main() {
  const state = loadState();
  const p3 = await db.user.findUnique({ where: { clerkId: P3 } });
  if (!p3) throw new Error("no P3");

  log("=== PHASE E2: clean same-chapter relationship_contradiction via live path ===");

  let ch8Id = state.book1Chapters["8"];
  if (!ch8Id) {
    const c = await call("POST", `/api/books/${state.book1Id}/chapters`, P3, { actNumber: 1, chapterNumber: 8 }, "53_create_book1_ch8");
    ch8Id = (c.body as any).id;
    state.book1Chapters["8"] = ch8Id;
    saveState(state);
    await call("PUT", `/api/books/${state.book1Id}/chapters/${ch8Id}/content`, P3, { markdown: CH8, changeSource: "user" }, "54_put_book1_ch8");
  }

  const keys = await getExtractionKeysForUser(p3.id);
  const env = await updateFromChapter(state.book1Id, 8, CH8, p3.defaultModel ?? undefined, keys, p3.id);
  log("ch8 extraction:", JSON.stringify(env));

  const edges = await withSession("READ", async (s) => {
    const r = await s.run(
      `MATCH (ca:Character {bookId:$b})-[r:ALLIED_WITH|OPPOSES]-(cb:Character {bookId:$b})
       WHERE id(ca)<id(cb) RETURN ca.name AS a, type(r) AS t, cb.name AS b, r.chapter AS ch
       ORDER BY a,b,t`,
      { b: state.book1Id }
    );
    return r.records.map((x) => ({ a: x.get("a"), t: x.get("t"), b: x.get("b"), ch: x.get("ch")?.toNumber?.() ?? x.get("ch") }));
  });
  log("Kira/Vael edges after ch8:", JSON.stringify(edges));

  // Live HTTP scan → persist
  const scan = await call("POST", `/api/books/${state.book1Id}/continuity/scan?chapterNumber=8`, P3, undefined, "55_http_scan_book1_ch8");
  log("scan ch8 flags:", (scan.body as any)?.flags?.length);

  const rows = await db.continuityFlag.findMany({
    where: { bookId: state.book1Id, status: "active" },
    select: { type: true, severity: true, chapterNumber: true, description: true, entities: true },
    orderBy: { type: "asc" },
  });

  let out = `=== relationship_contradiction — LIVE HTTP PERSISTENCE (clean ch8) ===\ncaptured: ${new Date().toISOString()}\n\n`;
  out += `ch8 extraction envelope: ${JSON.stringify(env)}\n\n`;
  out += `--- ALLIED_WITH/OPPOSES edges after ch8 ---\n`;
  for (const e of edges) out += `  ${e.a} -[${e.t} ch=${e.ch}]- ${e.b}\n`;
  out += `\nPOST /continuity/scan?chapterNumber=8 → ${(scan.body as any)?.flags?.length} flags\n\n`;
  out += `--- Postgres ACTIVE ContinuityFlag rows (${rows.length}) ---\n`;
  for (const r of rows) out += `  [${r.severity}] ${r.type} ch${r.chapterNumber}: ${r.description}\n`;
  const types = new Set(rows.map((r) => r.type));
  out += `\nActive flag types now persisted via live HTTP path: ${JSON.stringify([...types])}\n`;
  writeNeo("06_relcontra_live_persist.txt", out);
  log(out);

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE E2 ERROR:", e);
  process.exit(1);
});
