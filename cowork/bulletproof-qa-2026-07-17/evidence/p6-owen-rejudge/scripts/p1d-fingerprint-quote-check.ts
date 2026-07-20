// Phase 1d: D-49 re-test — do the editorial rationales quote the fingerprint doc
// for phrases that actually exist in it? Fetch the live FINGERPRINT document and
// grep for the quoted phrases used in this run's finding rationales.
import { api, saveTrace, BOOK_ID } from "./_client";

async function main() {
  const out: Record<string, unknown> = {};

  const docs = await api("GET", `/api/books/${BOOK_ID}/documents`);
  const dbody = docs.body as { documents?: Array<Record<string, unknown>> };
  const docList = Array.isArray(dbody.documents) ? dbody.documents : (Array.isArray(docs.body) ? (docs.body as Array<Record<string, unknown>>) : []);
  const fp = docList.find((d) => (d.type as string) === "FINGERPRINT");
  if (!fp) {
    out["error"] = "no FINGERPRINT document";
    saveTrace("p1d-fingerprint-quote-check.json", out);
    console.log("NO FINGERPRINT");
    return;
  }
  const doc = await api("GET", `/api/books/${BOOK_ID}/documents/${fp.id}`);
  const content = ((doc.body as { content?: string; markdown?: string }).content ??
    (doc.body as { markdown?: string }).markdown ?? "") as string;
  const norm = content.normalize("NFC");

  // Phrases quoted (in double quotes) inside this run's finding rationales:
  const quotedPhrases = [
    "clipped, procedural, emotionally controlled", // b48e321f — baseline flagged as FABRICATED (D-49)
    "almost entirely avoids abstract psychological vocabulary", // acaf7362 — baseline said the real phrase is "avoids abstract psychological vocabulary"
    "avoids abstract psychological vocabulary",
    "what she saw, counted, tied", // baseline other fabricated phrase
    "the rain started at eight", // b48e321f rationale cites this as narrator's register
  ];

  out["fingerprint-meta"] = { id: fp.id, length: norm.length };
  out["quote-verification"] = quotedPhrases.map((p) => ({
    phrase: p,
    presentVerbatim: norm.includes(p),
    presentCaseInsensitive: norm.toLowerCase().includes(p.toLowerCase()),
  }));

  saveTrace("p1d-fingerprint-quote-check.json", { ...out, fingerprintContent: norm });
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => {
  console.error("ERR", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
