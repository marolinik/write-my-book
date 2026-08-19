import { readFileSync } from "fs";
import { join } from "path";
import { inflateSync } from "zlib";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

// Determine whether typst-emitted PDF text is recoverable as literal characters
// (ToUnicode / ActualText) or is opaque glyph-index encoded. Governs whether PDF
// prose truncation is directly testable in this env.
function inflateAll(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const blobs: string[] = [raw];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    for (const trim of [0, 1, 2]) {
      try { blobs.push(inflateSync(buf.subarray(start, end - trim)).toString("latin1")); break; } catch { /* */ }
    }
  }
  return blobs.join("\n");
}

const buf = readFileSync(join(BUNDLE, "artifacts", "export.pdf"));
const combined = inflateAll(buf);
const probes = ["Zk01Alpha", "Zk08Mid2", "Zk16Omega", "Kézirat", "Koszegi", "Puszczy", "São", "ToUnicode", "ActualText", "/CIDFont", "/Type0"];
const result: Record<string, boolean> = {};
for (const p of probes) result[p] = combined.includes(p);
console.log("PDF literal-text recoverability probe:");
console.log(JSON.stringify(result, null, 2));
console.log("Interpretation: if sentinels false but /Type0+/CIDFont true => glyph-encoded, prose not literally extractable here.");
