import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

/**
 * P1-24: a .docx is a zip, and mammoth inflated it whole with no cap, so a
 * small upload could expand to gigabytes inside the web process. This reads
 * the zip's central directory (no inflation), refuses archives whose declared
 * size, ratio or entry count is out of bounds, and then inflates every entry
 * with zlib's output cap set to the size the header declares, so a header
 * that lies is caught after at most that many bytes.
 */

export type DocxArchiveRefusal = "ARCHIVE_TOO_LARGE" | "TOO_MANY_ENTRIES" | "NOT_A_DOCX";
export type DocxArchiveInspection = { ok: true } | { ok: false; code: DocxArchiveRefusal };

export const DOCX_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const DOCX_MAX_ENTRIES = 2_000;
/** Overall expansion beyond this is a bomb, once the archive is over the floor below. */
export const DOCX_MAX_RATIO = 100;
const RATIO_FLOOR_BYTES = 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const inflateRawAsync = promisify(inflateRaw);

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function readCentralDirectory(buf: Buffer): CentralEntry[] | DocxArchiveRefusal {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) return "NOT_A_DOCX";
  const total = buf.readUInt16LE(eocd + 10);
  const directoryOffset = buf.readUInt32LE(eocd + 16);
  if (total > DOCX_MAX_ENTRIES) return "TOO_MANY_ENTRIES";
  // ZIP64 is only needed past 4 GB or 65,535 entries: never a manuscript.
  if (directoryOffset === ZIP64_MARKER) return "ARCHIVE_TOO_LARGE";

  const entries: CentralEntry[] = [];
  let at = directoryOffset;
  for (let n = 0; n < total; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL_SIGNATURE) return "NOT_A_DOCX";
    const nameLength = buf.readUInt16LE(at + 28);
    const entry: CentralEntry = {
      method: buf.readUInt16LE(at + 10),
      compressedSize: buf.readUInt32LE(at + 20),
      uncompressedSize: buf.readUInt32LE(at + 24),
      localOffset: buf.readUInt32LE(at + 42),
      name: buf.toString("utf8", at + 46, at + 46 + nameLength),
    };
    if (
      entry.compressedSize === ZIP64_MARKER ||
      entry.uncompressedSize === ZIP64_MARKER ||
      entry.localOffset === ZIP64_MARKER
    ) {
      return "ARCHIVE_TOO_LARGE";
    }
    entries.push(entry);
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
}

function entryData(buf: Buffer, entry: CentralEntry): Buffer | null {
  const at = entry.localOffset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== LOCAL_SIGNATURE) return null;
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const end = start + entry.compressedSize;
  return end > buf.length ? null : buf.subarray(start, end);
}

async function inflatesWithinDeclaredSize(
  buf: Buffer,
  entry: CentralEntry
): Promise<true | DocxArchiveRefusal> {
  if (entry.method === METHOD_STORED) return true;
  if (entry.method !== METHOD_DEFLATE) return "NOT_A_DOCX";
  const data = entryData(buf, entry);
  if (!data) return "NOT_A_DOCX";
  try {
    await inflateRawAsync(data, { maxOutputLength: Math.max(entry.uncompressedSize, 1) });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE"
      ? "ARCHIVE_TOO_LARGE"
      : "NOT_A_DOCX";
  }
}

export async function inspectDocxArchive(input: Buffer | ArrayBuffer): Promise<DocxArchiveInspection> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entries = readCentralDirectory(buf);
  if (typeof entries === "string") return { ok: false, code: entries };
  if (!entries.some((e) => e.name === "word/document.xml")) return { ok: false, code: "NOT_A_DOCX" };

  const declared = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  const compressed = entries.reduce((sum, e) => sum + e.compressedSize, 0);
  if (declared > DOCX_MAX_UNCOMPRESSED_BYTES) return { ok: false, code: "ARCHIVE_TOO_LARGE" };
  if (declared > RATIO_FLOOR_BYTES && declared > Math.max(compressed, 1) * DOCX_MAX_RATIO) {
    return { ok: false, code: "ARCHIVE_TOO_LARGE" };
  }

  for (const entry of entries) {
    const verdict = await inflatesWithinDeclaredSize(buf, entry);
    if (verdict !== true) return { ok: false, code: verdict };
  }
  return { ok: true };
}
