/**
 * Phase C — VERIFY against the real graph. Direct Neo4j reads (scoped by bookId)
 * + the product's own runConsistencyChecks() + persisted ContinuityFlag rows.
 * Writes evidence to neo4j-reads/. No mutation.
 */
import { db } from "@/lib/db";
import { withSession } from "@/lib/graph/neo4j-client";
import { runConsistencyChecks } from "@/lib/graph/graph-queries";
import { loadState, writeNeo, log } from "./_lib";

async function q(cypher: string, params: any): Promise<any[]> {
  try {
    return await withSession("READ", async (s) => {
      const r = await s.run(cypher, params);
      return r.records.map((rec) => rec.toObject());
    });
  } catch (e) {
    console.error("QUERY FAILED:", (e as Error).message, "\n  cypher:", cypher.replace(/\s+/g, " ").slice(0, 160));
    return [];
  }
}
function n(v: any): any {
  if (v == null) return v;
  if (typeof v === "object" && "toNumber" in v) return v.toNumber();
  return v;
}

async function dumpBook(bookId: string, tag: string, userId: string): Promise<string> {
  let out = `=== GRAPH STATE — ${tag} (bookId=${bookId}) ===\n`;
  out += `captured: ${new Date().toISOString()}\n\n`;

  const chars = await q(
    `MATCH (c:Character {bookId:$b})
     RETURN c.name AS name, c.status AS status, c.deathChapter AS deathChapter,
            c.role AS role, c.aliases AS aliases, c.firstAppearance AS fa,
            c.lastMentioned AS lm, c.userId AS userId
     ORDER BY c.name`,
    { b: bookId }
  );
  out += `--- CHARACTERS (${chars.length}) ---\n`;
  for (const c of chars) {
    out += `  ${c.name} | status=${c.status} deathChapter=${n(c.deathChapter)} role=${c.role} `;
    out += `aliases=${JSON.stringify(c.aliases)} first=${n(c.fa)} last=${n(c.lm)} userId=${c.userId ?? "(none)"}\n`;
  }

  const events = await q(
    `MATCH (e:Event {bookId:$b})
     RETURN e.name AS name, e.chapter AS chapter, e.occursInChapter AS occurs,
            e.canonicalName AS canon, e.eventType AS etype, e.deathOf AS deathOf
     ORDER BY e.chapter, e.name`,
    { b: bookId }
  );
  out += `\n--- EVENTS (${events.length}) [D-19: chapter/occursInChapter must be non-null] ---\n`;
  for (const e of events) {
    out += `  "${e.name}" | chapter=${n(e.chapter)} occursInChapter=${n(e.occurs)} canon="${e.canon}" type=${e.etype ?? ""} deathOf=${e.deathOf ?? ""}\n`;
  }

  const deadPart = await q(
    `MATCH (c:Character {bookId:$b}) WHERE c.status='dead'
     OPTIONAL MATCH (c)-[:PARTICIPATES_IN]->(e:Event {bookId:$b})
     RETURN c.name AS name, c.deathChapter AS dc,
            e.name AS event, e.chapter AS echapter, e.occursInChapter AS eoccurs
     ORDER BY c.name, e.chapter`,
    { b: bookId }
  );
  out += `\n--- DEAD CHARACTERS + their PARTICIPATES_IN events (dead_character_reappears mechanics) ---\n`;
  const byChar = new Map<string, any[]>();
  for (const d of deadPart) {
    if (!byChar.has(d.name)) byChar.set(d.name, []);
    byChar.get(d.name)!.push(d);
  }
  for (const [name, rows] of byChar) {
    out += `  ${name} (deathChapter=${n(rows[0].dc)}):\n`;
    for (const p of rows) {
      if (!p.event) continue;
      const occ = n(p.eoccurs);
      const ch = n(p.echapter);
      const eff = occ ?? ch;
      const flag = eff > n(p.dc) ? "  <-- POST-DEATH PARTICIPATION (should FIRE)" : "";
      out += `      participates in "${p.event}" chapter=${ch} occursInChapter=${occ} effective=${eff}${flag}\n`;
    }
  }

  const dies = await q(
    `MATCH (c:Character {bookId:$b})-[r:DIES_IN]->(e:Event)
     RETURN c.name AS c, e.name AS e, e.chapter AS ech, e.occursInChapter AS eocc, r.chapter AS rch`,
    { b: bookId }
  );
  out += `\n--- DIES_IN death-anchor reification (sub-fix 7d) ---\n`;
  for (const d of dies) out += `  ${d.c} -DIES_IN-> "${d.e}" (eventChapter=${n(d.ech)} occurs=${n(d.eocc)} edge.chapter=${n(d.rch)})\n`;

  const rels = await q(
    `MATCH (ca:Character {bookId:$b})-[r:ALLIED_WITH|OPPOSES]-(cb:Character {bookId:$b})
     WHERE id(ca)<id(cb)
     RETURN ca.name AS fromName, type(r) AS t, cb.name AS toName, r.chapter AS ch
     ORDER BY fromName, toName, t`,
    { b: bookId }
  );
  out += `\n--- ALLIED_WITH / OPPOSES edges (relationship_contradiction mechanics; needs same pair+same chapter) ---\n`;
  for (const r of rels) out += `  ${r.fromName} -[${r.t} ch=${n(r.ch)}]- ${r.toName}\n`;

  const leads = await q(
    `MATCH (a:Event {bookId:$b})-[r:LEADS_TO]->(c:Event {bookId:$b})
     RETURN a.name AS a, a.chapter AS ach, a.occursInChapter AS aocc,
            c.name AS c, c.chapter AS cch, c.occursInChapter AS cocc, r.chapter AS rch`,
    { b: bookId }
  );
  out += `\n--- LEADS_TO edges (timeline_violation mechanics; fires when later.occurs > earlier.occurs) ---\n`;
  for (const l of leads) {
    const la = n(l.aocc) ?? n(l.ach);
    const lc = n(l.cocc) ?? n(l.cch);
    const flag = la > lc ? "  <-- SOURCE occurs AFTER TARGET (should FIRE)" : "";
    out += `  "${l.a}"(ch=${n(l.ach)}/occ=${n(l.aocc)}) -LEADS_TO-> "${l.c}"(ch=${n(l.cch)}/occ=${n(l.cocc)})${flag}\n`;
  }

  // Product's own consistency checks (tenant-scoped, exactly as the scan route calls it).
  const issues = await runConsistencyChecks(bookId, userId);
  out += `\n=== runConsistencyChecks(bookId, P3) → ${issues.length} issue(s) [PRODUCT CODE] ===\n`;
  for (const i of issues) {
    out += `  [${i.severity}] ${i.type}: ${i.description}\n      entities=${JSON.stringify(i.entities)} chapters=${JSON.stringify(i.chapters)}\n`;
  }
  return out;
}

async function main() {
  const state = loadState();
  const p3 = await db.user.findUnique({ where: { clerkId: "user_qa_p3" } });
  if (!p3) throw new Error("no P3");

  log("=== PHASE C: VERIFY ===");
  const b1 = await dumpBook(state.book1Id, "BOOK 1 (Emberfall)", p3.id);
  writeNeo("01_book1_graph_state.txt", b1);
  log(b1);

  const b2 = await dumpBook(state.book2Id, "BOOK 2 (Ashfall)", p3.id);
  writeNeo("02_book2_graph_state.txt", b2);

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE C ERROR:", e);
  process.exit(1);
});
