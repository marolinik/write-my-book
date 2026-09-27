/** Largest cover / back-cover / series cover a writer may upload. The client
 *  checks the same number and the coverHint copy promises it in every
 *  language, so all three routes and the JSON ceiling below derive from it. */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** JSON ceiling for the cover routes. Covers travel as a base64 data URL
 *  inside JSON, which is 4/3 of the raw size; the generic 5 MiB ceiling
 *  therefore rejected every image above ~3.75 MiB with 413 and the promised
 *  8 MB check was unreachable (UAT P7-S11). The slack covers the data-URL
 *  prefix and the JSON envelope. */
export const MAX_COVER_JSON_BODY_BYTES = Math.ceil((MAX_COVER_BYTES * 4) / 3) + 64 * 1024;

const PREFIX = "data:";
const MARKER = ";base64,";

/** Split `data:<mime>;base64,<payload>` into mime + decoded bytes. Uses plain
 *  index lookups: the previous `/^data:([^;,]+);base64,(.+)$/` regex threw
 *  "Maximum call stack size exceeded" on multi-megabyte payloads. Returns null
 *  for anything that is not a non-empty base64 data URL. */
export function parseImageDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl.startsWith(PREFIX)) return null;
  const markerAt = dataUrl.indexOf(MARKER, PREFIX.length);
  if (markerAt <= PREFIX.length) return null;
  const mime = dataUrl.slice(PREFIX.length, markerAt);
  if (mime.includes(",") || mime.includes(";")) return null;
  const payload = dataUrl.slice(markerAt + MARKER.length);
  if (payload.length === 0) return null;
  return { mime: mime.toLowerCase(), buffer: Buffer.from(payload, "base64") };
}
