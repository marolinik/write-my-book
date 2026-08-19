/**
 * Phase E2b — re-extract ch5 (a legitimate chapter edit) so ALLIED_WITH and
 * OPPOSES for Kira↔Vael are both re-asserted at ch5, restoring the same-chapter
 * co-assertion the check keys off, then persist via the live HTTP scan. This
 * demonstrates relationship_contradiction through the endpoint on the SAME graph.
 */
import { db } from "@/lib/db";
import { withSession } from "@/lib/graph/neo4j-client";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { getExtractionKeysForUser } from "@/lib/agents/extraction-keys";
import { call, loadState, writeNeo, log, BOOK1_CHAPTERS } from "./_lib";

const P3 = "user_qa_p3";
const CH5_V2 =
  BOOK1_CHAPTERS[5] +
  `\n\nEven as the court looked on, it was plain that Kira Venn and Vael Thorne were allies and enemies in this very hour: Kira Venn and Vael Thorne were allied by the old oath, and in the same hour Vael Thorne opposed Kira Venn. Allied and opposed at once — Kira Venn and Vael Thorne.`;

async function main() {
  const state = loadState();
  const p3 = await db.user.findUnique({ where: { clerkId: P3 } });
  if (!p3) throw new Error("no P3");
  const ch5Id = state.book1Chapters["5"];

  log("=== PHASE E2b: re-extract ch5, restore same-chapter co-assertion ===");
  // Save edited ch5 via a trusted source (bypasses the D-47 CAS on an existing doc).
  const put = await call(
    "PUT",
    `/api/books/${state.book1Id}/chapters/${ch5Id}/content`,
    P3,
    { markdown: CH5_V2, changeSource: "system" },
    "56_put_book1_ch5_v2"
  );
  log("ch5 re-save:", put.status);

  const keys = await getExtractionKeysForUser(p3.id);
  const env = await updateFromChapter(state.book1Id, 5, CH5_V2, p3.defaultModel ?? undefined, keys, p3.id);
  log("ch5 re-extraction:", JSON.stringify(env));

  const edges = await withSession("READ", async (s) => {
    const r = await s.run(
      `MATCH (ca:Character {bookId:$b})-[r:ALLIED_WITH|OPPOSES]-(cb:Character {bookId:$b})
       WHERE id(ca)<id(cb) RETURN ca.name AS a, type(r) AS t, cb.name AS b, r.chapter AS ch ORDER BY a,b,t`,
      { b: state.book1Id }
    );
    return r.records.map((x) => ({ a: x.get("a"), t: x.get("t"), b: x.get("b"), ch: x.get("ch")?.toNumber?.() ?? x.get("ch") }));
  });
  log("edges after ch5 re-extract:", JSON.stringify(edges));

  const scan = await call("POST", `/api/books/${state.book1Id}/continuity/scan?chapterNumber=5`, P3, undefined, "57_http_scan_book1_ch5_v2");
  log("scan flags:", (scan.body as any)?.flags?.length);

  const rows = await db.continuityFlag.findMany({
    where: { bookId: state.book1Id, status: "active" },
    select: { type: true, severity: true, chapterNumber: true, description: true },
    orderBy: { type: "asc" },
  });

  let out = `=== relationship_contradiction — LIVE HTTP PERSIST after ch5 re-extract ===\ncaptured: ${new Date().toISOString()}\n\n`;
  out += `ch5 re-extraction envelope: ${JSON.stringify(env)}\n\n--- ALLIED/OPPOSES edges ---\n`;
  for (const e of edges) out += `  ${e.a} -[${e.t} ch=${e.ch}]- ${e.b}\n`;
  out += `\nPOST /continuity/scan?chapterNumber=5 → ${(scan.body as any)?.flags?.length} flags\n\n--- Postgres ACTIVE ContinuityFlag rows (${rows.length}) ---\n`;
  for (const r of rows) out += `  [${r.severity}] ${r.type} ch${r.chapterNumber}: ${r.description}\n`;
  out += `\nActive flag types persisted via live HTTP path: ${JSON.stringify([...new Set(rows.map((r) => r.type))])}\n`;
  writeNeo("06_relcontra_live_persist.txt", out);
  log(out);
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("PHASE E2b ERROR:", e); process.exit(1); });
