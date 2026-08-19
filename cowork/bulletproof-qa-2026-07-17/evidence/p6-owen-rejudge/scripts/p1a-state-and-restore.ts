// Phase 1a: check current ch5 content + findings; restore ch5 to the planted-probe
// manuscript (byte-exact) so the voice-moat re-test runs against the SAME pre-registered
// probe the baseline used. Uses changeSource:"restore" (trusted versionless source).
import { readFileSync } from "node:fs";
import { api, saveTrace, BOOK_ID, CHAPTERS } from "./_client";

const PLANTED_PATH =
  "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p6-owen/manuscripts/owen-ch5-what-the-water-keeps.md";

function nfc(s: string): string {
  return s.normalize("NFC").replace(/\r\n/g, "\n");
}

async function main() {
  const out: Record<string, unknown> = {};
  const planted = nfc(readFileSync(PLANTED_PATH, "utf8")).replace(/\n+$/,"\n");

  // Current ch5 content
  const getC = await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`);
  const cur = nfc(((getC.body as { markdown?: string }).markdown) ?? "").replace(/\n+$/,"\n");
  out["ch5-content-before"] = {
    status: getC.status,
    version: (getC.body as { version?: number }).version,
    wordCount: (getC.body as { wordCount?: number }).wordCount,
    len: cur.length,
    matchesPlanted: cur === planted,
  };

  // Pending findings across the book (any chapter)
  const findAll = await api("GET", `/api/books/${BOOK_ID}/editorial/findings?limit=100`);
  const fbody = findAll.body as { findings?: Array<Record<string, unknown>>; total?: number };
  out["findings-before"] = {
    total: fbody.total,
    byStatusChapter: (fbody.findings ?? []).map((f) => ({
      id: (f.id as string).slice(0, 8),
      ch: f.chapterNumber,
      status: f.status,
      severity: f.severity,
      category: f.category,
      created: f.createdAt,
    })),
  };

  // Restore ch5 to planted probe if drifted
  if (cur !== planted) {
    const put = await api(
      "PUT",
      `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`,
      { markdown: planted, changeSource: "restore" }
    );
    out["ch5-restore"] = put;
    const verify = await api("GET", `/api/books/${BOOK_ID}/chapters/${CHAPTERS["5"]}/content`);
    const v = nfc(((verify.body as { markdown?: string }).markdown) ?? "").replace(/\n+$/,"\n");
    out["ch5-content-after-restore"] = {
      status: verify.status,
      version: (verify.body as { version?: number }).version,
      matchesPlanted: v === planted,
    };
  } else {
    out["ch5-restore"] = "SKIPPED — already byte-identical to planted probe";
  }

  saveTrace("p1a-state-and-restore.json", out);
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => {
  console.error("ERR", e?.message ?? e);
  process.exit(1);
});
