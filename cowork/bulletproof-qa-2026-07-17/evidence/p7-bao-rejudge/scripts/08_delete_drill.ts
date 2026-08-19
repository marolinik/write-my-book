import { apiJson, flushTraces, saveJson } from "./lib";
import { readFileSync } from "fs";
import { join } from "path";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

async function main() {
  const state = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "book-state.json"), "utf-8"));
  const bookId: string = state.bookId;
  const chapterId: string = state.firstChapterId;

  // Confirm still present, then DELETE.
  const pre = await apiJson("pre-delete-get", "GET", `/api/books/${bookId}`);
  const del = await apiJson("delete-book", "DELETE", `/api/books/${bookId}`);
  console.log("delete status", del.status, JSON.stringify(del.json));

  // Probe a broad set of book-scoped routes after deletion; collect error copy.
  const probes: Array<{ label: string; method: string; path: string; body?: unknown }> = [
    { label: "get-book", method: "GET", path: `/api/books/${bookId}` },
    { label: "delete-again", method: "DELETE", path: `/api/books/${bookId}` },
    { label: "patch-book", method: "PATCH", path: `/api/books/${bookId}`, body: { name: "x" } },
    { label: "get-chapters", method: "GET", path: `/api/books/${bookId}/chapters` },
    { label: "get-chapter-content", method: "GET", path: `/api/books/${bookId}/chapters/${chapterId}/content` },
    { label: "put-chapter-content", method: "PUT", path: `/api/books/${bookId}/chapters/${chapterId}/content`, body: { markdown: "x", expectedVersion: 1 } },
    { label: "post-export", method: "POST", path: `/api/books/${bookId}/export`, body: { format: "docx" } },
    { label: "get-export-list", method: "GET", path: `/api/books/${bookId}/export` },
    { label: "get-export-file", method: "GET", path: `/api/books/${bookId}/export/whatever.docx` },
    { label: "reorder", method: "PATCH", path: `/api/books/${bookId}/chapters/reorder`, body: { order: [{ chapterId, chapterNumber: 1 }] } },
    { label: "get-settings", method: "GET", path: `/api/books/${bookId}/settings` },
    { label: "get-analysis", method: "GET", path: `/api/books/${bookId}/analysis` },
    { label: "get-wiki", method: "GET", path: `/api/books/${bookId}/wiki` },
    { label: "get-findings", method: "GET", path: `/api/books/${bookId}/editorial/findings` },
    { label: "get-writing-stats", method: "GET", path: `/api/books/${bookId}/writing-stats` },
    { label: "get-search", method: "GET", path: `/api/books/${bookId}/search?q=abc` },
    { label: "get-continuity", method: "GET", path: `/api/books/${bookId}/continuity` },
  ];

  const results: any[] = [];
  for (const p of probes) {
    const r = await apiJson(`postdel-${p.label}`, p.method, p.path, p.body);
    const errMsg = r.json && typeof r.json === "object" ? r.json.error : undefined;
    results.push({ label: p.label, method: p.method, status: r.status, errorMsg: errMsg });
  }

  const notFoundVariants = Array.from(
    new Set(results.filter((r) => r.status === 404 && r.errorMsg).map((r) => r.errorMsg))
  );
  const nonBookNotFound = results.filter((r) => r.status === 404 && r.errorMsg && r.errorMsg !== "Book not found");

  const summary = {
    bookId,
    deleteStatus: del.status,
    deleteBody: del.json,
    probeCount: results.length,
    statusBreakdown: results.reduce((acc: any, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {}),
    distinct404ErrorMessages: notFoundVariants,
    d57_allBookScoped404sSayBookNotFound: nonBookNotFound.length === 0,
    d57_inconsistentEntries: nonBookNotFound,
    results,
  };
  saveJson("delete-drill-d57.json", summary);
  console.log(JSON.stringify({ ...summary, results: `[${results.length} probes]` }, null, 2));
  console.log("distinct 404 messages:", JSON.stringify(notFoundVariants));
  flushTraces("08-delete-drill-d57.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
