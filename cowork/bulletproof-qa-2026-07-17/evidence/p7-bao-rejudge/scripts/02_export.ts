import { apiJson, apiRaw, flushTraces, saveArtifact, saveJson } from "./lib";
import { readFileSync } from "fs";
import { join } from "path";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

async function exportOne(bookId: string, format: "docx" | "pdf" | "epub") {
  const t0 = Date.now();
  const res = await apiJson(`export-${format}`, "POST", `/api/books/${bookId}/export`, { format });
  const ms = Date.now() - t0;
  console.log(`export ${format}: status=${res.status} ${ms}ms resp=${JSON.stringify(res.json)}`);
  if (res.status !== 200) return { format, ok: false, resp: res.json ?? res.text };
  const filename: string = res.json.filename;
  // Download the produced file bytes.
  const dl = await apiRaw(`download-${format}`, "GET", `/api/books/${bookId}/export/${encodeURIComponent(filename)}`);
  console.log(`download ${format}: status=${dl.status} bytes=${dl.buf.length} cd=${dl.headers.get("content-disposition")}`);
  const localName = `export.${res.json.format}`; // format may be 'md' on fallback
  saveArtifact(localName, dl.buf);
  return {
    format,
    ok: dl.status === 200 && dl.buf.length > 0,
    apiResp: res.json,
    downloadStatus: dl.status,
    downloadBytes: dl.buf.length,
    contentDisposition: dl.headers.get("content-disposition"),
    contentType: dl.headers.get("content-type"),
    localFile: localName,
  };
}

async function main() {
  const state = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "book-state.json"), "utf-8"));
  const bookId: string = state.bookId;
  console.log("bookId", bookId);

  const results: any = {};
  for (const fmt of ["docx", "pdf", "epub"] as const) {
    results[fmt] = await exportOne(bookId, fmt);
  }
  saveJson("export-results.json", { bookId, results });
  flushTraces("02-export.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
