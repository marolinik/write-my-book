import { readFileSync } from "fs";
import { join } from "path";
import { inflateSync } from "zlib";
import { saveJson, flushTraces, pushTrace } from "./lib";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

// Inflate every FlateDecode stream in the PDF and return raw + all inflated
// blobs concatenated (latin1) so markers hidden inside object/xref streams
// (typst uses compressed object streams) become visible to plain regex.
function gatherText(buf: Buffer): { raw: string; combined: string; inflatedCount: number } {
  const raw = buf.toString("latin1");
  const blobs: string[] = [raw];
  let inflatedCount = 0;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const endIdx = raw.indexOf("endstream", start);
    if (endIdx < 0) continue;
    let end = endIdx;
    // trim trailing EOL before endstream
    const slice = buf.subarray(start, end);
    try {
      const inf = inflateSync(slice);
      blobs.push(inf.toString("latin1"));
      inflatedCount++;
    } catch {
      // not a flate stream (or has trailing bytes); try trimming 0-2 bytes
      for (const trim of [1, 2]) {
        try {
          const inf = inflateSync(buf.subarray(start, end - trim));
          blobs.push(inf.toString("latin1"));
          inflatedCount++;
          break;
        } catch { /* keep trying */ }
      }
    }
  }
  return { raw, combined: blobs.join("\n"), inflatedCount };
}

function decodePdfString(m: string): string {
  // m is the inside of /Title(...) or /Title<...>
  if (m.startsWith("feff") || m.startsWith("FEFF")) {
    // hex UTF-16BE
    const hex = m.replace(/[^0-9a-fA-F]/g, "");
    let out = "";
    for (let i = 4; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    }
    return out;
  }
  if (/^[0-9a-fA-F\s]+$/.test(m) && m.length % 2 === 0) {
    const hex = m.replace(/\s/g, "");
    let out = "";
    for (let i = 0; i + 2 <= hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return out;
  }
  return m;
}

function findTitle(text: string): { titleUtf16?: string; titleLiteral?: string; xmp?: string } {
  const out: any = {};
  // Hex string form: /Title <feff...>
  const hex = text.match(/\/Title\s*<([0-9a-fA-F\s]+)>/);
  if (hex) {
    const dec = decodePdfString(hex[1].toLowerCase().startsWith("feff") ? hex[1] : "feff" + hex[1]);
    out.titleUtf16 = dec;
  }
  // Literal string form: /Title (....)
  const lit = text.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/);
  if (lit) {
    let s = lit[1].replace(/\\([()\\])/g, "$1");
    // pdfDocEncoding utf-16? if starts with \376\377 it's utf-16be octal
    if (s.startsWith("þÿ")) {
      let o = "";
      for (let i = 2; i + 2 <= s.length; i += 2) o += String.fromCharCode(s.charCodeAt(i) * 256 + s.charCodeAt(i + 1));
      s = o;
    }
    out.titleLiteral = s;
  }
  // XMP dc:title
  const xmp = text.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
  if (xmp) out.xmp = xmp[1].trim();
  const xmp2 = text.match(/<dc:title>\s*<rdf:Alt>[\s\S]*?<\/rdf:Alt>\s*<\/dc:title>/);
  return out;
}

async function main() {
  const expected = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "expected-chapters.json"), "utf-8"));
  const exportResults = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "export-results.json"), "utf-8"));
  const bookName: string = expected.bookName;
  const buf = readFileSync(join(BUNDLE, "artifacts", "export.pdf"));

  const { raw, combined, inflatedCount } = gatherText(buf);

  // Page count: count /Type /Page (NOT /Pages).
  const pageObjMatches = (combined.match(/\/Type\s*\/Page(?![sA-Za-z])/g) || []).length;
  // /Count in the pages tree root (may appear multiple times for nested nodes;
  // the max is the total for a single-level tree; report all).
  const counts = Array.from(combined.matchAll(/\/Count\s+(\d+)/g)).map((x) => parseInt(x[1], 10));
  const maxCount = counts.length ? Math.max(...counts) : null;

  const title = findTitle(combined);

  // XMP block presence
  const hasXmp = /<x:xmpmeta/.test(combined) || /<rdf:RDF/.test(combined);

  const estimatedPages = exportResults.results.pdf.apiResp.estimatedPages;
  const actualPages = pageObjMatches > 0 ? pageObjMatches : maxCount;
  const gapPct = actualPages ? ((estimatedPages - actualPages) / actualPages) * 100 : null;

  const titleResolved = title.titleUtf16 || title.titleLiteral || title.xmp || null;
  const norm = (s: string) => s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

  const report = {
    pdfBytes: buf.length,
    inflatedStreams: inflatedCount,
    header: raw.slice(0, 20),
    producer: (combined.match(/\/Producer\s*[<(]([^>)]*)[>)]/) || [])[1] || null,
    pageCount: {
      byTypePageObjects: pageObjMatches,
      byMaxCountEntry: maxCount,
      allCountEntries: counts,
      resolvedActualPages: actualPages,
    },
    estimatedPages,
    gapPctEstimateVsActual: gapPct,
    d61_within15pct: gapPct !== null ? Math.abs(gapPct) <= 15 : null,
    metadataTitle: {
      raw: titleResolved,
      titleUtf16: title.titleUtf16 ?? null,
      titleLiteral: title.titleLiteral ?? null,
      xmp: title.xmp ?? null,
      hasXmpBlock: hasXmp,
      matchesBookName: titleResolved ? norm(titleResolved) === norm(bookName) : false,
    },
    d05_pdfTitlePresent: !!titleResolved,
  };

  pushTrace({ label: "pdf-analyze", method: "LOCAL", url: "artifacts/export.pdf", status: 200, ok: !!titleResolved,
    note: `pages actual=${actualPages} est=${estimatedPages} gap=${gapPct?.toFixed(1)}%; title=${titleResolved}` });

  saveJson("pdf-analysis.json", report);
  console.log(JSON.stringify(report, null, 2));
  flushTraces("04-pdf-analyze.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
