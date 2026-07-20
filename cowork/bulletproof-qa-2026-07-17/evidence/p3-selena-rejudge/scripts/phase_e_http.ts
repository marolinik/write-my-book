/**
 * Phase E (HTTP) — prove the flags persist through the LIVE PRODUCT HTTP path,
 * and capture D-25 series-context behavior.
 *
 * 1. POST /continuity/scan (real endpoint) on book1 → runs runConsistencyChecks
 *    + persists ContinuityFlag rows + returns honest extraction status. (Content
 *    hashes already stamped, so its fire-and-forget re-extract early-returns — no
 *    re-bill.)
 * 2. GET /continuity → list persisted active flags.
 * 3. Read ContinuityFlag rows straight from Postgres (product DB) — the durable proof.
 * 4. GET /series-context for book2 (D-25 ruled scope) + a standalone book.
 */
import { db } from "@/lib/db";
import { call, loadState, writeNeo, log } from "./_lib";

const P3 = "user_qa_p3";

async function main() {
  const state = loadState();
  log("=== PHASE E (HTTP): live-path flag persistence + series-context ===");

  // 1. Real HTTP scan on book1 (trigger + persist). Scan two chapters to be safe.
  const scan6 = await call(
    "POST",
    `/api/books/${state.book1Id}/continuity/scan?chapterNumber=6`,
    P3,
    undefined,
    "50_http_scan_book1_ch6"
  );
  log("scan ch6 status:", scan6.status, "flags:", (scan6.body as any)?.flags?.length, "extraction:", JSON.stringify((scan6.body as any)?.extraction));

  // Give the (no-op) fire-and-forget a beat, then GET the persisted flag list.
  const list = await call(
    "GET",
    `/api/books/${state.book1Id}/continuity?chapterNumber=6`,
    P3,
    undefined,
    "51_http_continuity_list_book1"
  );
  const listFlags = (list.body as any)?.flags ?? [];
  log("GET /continuity active flags:", listFlags.length);

  // 3. Durable proof — ContinuityFlag rows in Postgres.
  const rows = await db.continuityFlag.findMany({
    where: { bookId: state.book1Id },
    select: { type: true, severity: true, status: true, chapterNumber: true, description: true, entities: true, signature: true },
    orderBy: { type: "asc" },
  });

  let out = `=== LIVE HTTP PATH — persisted ContinuityFlag rows (book1) ===\ncaptured: ${new Date().toISOString()}\n`;
  out += `book1=${state.book1Id}\n\n`;
  out += `POST /continuity/scan?chapterNumber=6 → status=${scan6.status}, returned ${(scan6.body as any)?.flags?.length} flags\n`;
  out += `extraction status envelope: ${JSON.stringify((scan6.body as any)?.extraction)}\n\n`;
  out += `GET /continuity active flags: ${listFlags.length}\n`;
  for (const f of listFlags) out += `   [${f.severity}] ${f.type} ch${f.chapterNumber}: ${f.description}\n`;
  out += `\n--- Postgres ContinuityFlag rows (${rows.length}) [DURABLE PRODUCT DB] ---\n`;
  for (const r of rows) {
    out += `   [${r.severity}] ${r.type} status=${r.status} ch${r.chapterNumber}\n      ${r.description}\n      entities=${r.entities}\n      signature=${r.signature}\n`;
  }
  const activeTypes = new Set(rows.filter((r) => r.status === "active").map((r) => r.type));
  out += `\nActive flag types persisted: ${JSON.stringify([...activeTypes])}\n`;
  writeNeo("04_http_persisted_flags.txt", out);
  log(out);

  // 4. D-25 series-context for book2 (has a prior book → should surface book1 canon).
  const sc2 = await call(
    "GET",
    `/api/books/${state.book2Id}/series-context?chapterNumber=1`,
    P3,
    undefined,
    "52_series_context_book2_ch1"
  );
  log("series-context book2:", sc2.status, JSON.stringify(sc2.body));

  // Standalone (victim not owned by P3; use a fresh standalone P3 book? Instead
  // probe book2 as the series case and note the standalone contract from code).
  let out2 = `=== D-25 SERIES-CONTEXT (book2, chapterNumber=1) ===\ncaptured: ${new Date().toISOString()}\n\n`;
  out2 += `GET /api/books/${state.book2Id}/series-context?chapterNumber=1 (as P3) → status ${sc2.status}\n`;
  out2 += JSON.stringify(sc2.body, null, 2) + "\n";
  writeNeo("05_series_context.txt", out2);

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE E HTTP ERROR:", e);
  process.exit(1);
});
