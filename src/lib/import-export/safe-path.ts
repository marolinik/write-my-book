import { isAbsolute, join, resolve, sep } from "path";

/**
 * Directory that legitimately-referenced custom export templates / cover assets
 * must live inside (D-21).
 *
 * The product has NO upload flow for these files — the export-config UI exposes
 * `customTemplates.{docxReference,typstTemplate,epubCss}` and
 * `frontMatter.coverImagePath` as free-text fields, and nothing writes them to a
 * per-user storage namespace. The only files the server may safely read for
 * them are the operator-bundled, non-secret assets shipped in `export-templates/`
 * (lua filters, the default typst template, the default EPUB CSS). Anything else
 * — an absolute URL (SSRF), a UNC path (outbound SMB/NTLM), an absolute local
 * path, or a `../` escape (arbitrary local file read of `.env`, mounted secrets,
 * `/etc/passwd`) — is rejected before it can reach pandoc.
 */
export const TEMPLATE_ALLOWLIST_DIR = join(process.cwd(), "export-templates");

/**
 * Matches a leading URL scheme (`http:`, `https:`, `file:`, `ftp:`, `data:`, …)
 * AND a Windows drive letter (`C:`). Both must be rejected for these fields: the
 * former is the SSRF/remote-fetch vector, the latter an absolute-path vector.
 */
const SCHEME_OR_DRIVE_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * True when `value` is a SAFE reference for a custom template / cover asset:
 * either empty (meaning "use the bundled default") or a relative path that
 * normalizes to a location contained within `baseDir`.
 *
 * Rejects, in order: URL schemes and Windows drive letters, UNC prefixes
 * (`\\host` / `//host`), any absolute path, and any relative path that escapes
 * `baseDir` via `../`. Pure and synchronous — safe to use inside a Zod refine
 * and cheap to re-run defensively at consumption time.
 */
export function isSafeTemplatePath(
  value: string,
  baseDir: string = TEMPLATE_ALLOWLIST_DIR
): boolean {
  if (value === "") return true;
  if (SCHEME_OR_DRIVE_RE.test(value)) return false; // http://…, file:…, C:\…
  if (value.startsWith("\\\\") || value.startsWith("//")) return false; // UNC
  if (isAbsolute(value)) return false;
  const base = resolve(baseDir);
  const resolved = resolve(base, value);
  // Trailing separator prevents a sibling-prefix bypass (…/export-templates-evil).
  return resolved === base || resolved.startsWith(base + sep);
}

/**
 * Resolve a custom template / cover value to an ABSOLUTE path inside the
 * allowlist, or `null` when it is empty or unsafe.
 *
 * Consumers pass the returned absolute path straight to pandoc (so it opens the
 * intended bundled file regardless of the process CWD) and treat `null` as "no
 * usable custom value — fall back to the bundled default." This is the
 * defense-in-depth layer that stops a pre-existing / out-of-band bad value from
 * ever reaching pandoc even if the validation boundary is somehow bypassed.
 */
export function resolveSafeTemplatePath(
  value: string,
  baseDir: string = TEMPLATE_ALLOWLIST_DIR
): string | null {
  if (!value || !isSafeTemplatePath(value, baseDir)) return null;
  return resolve(baseDir, value);
}
