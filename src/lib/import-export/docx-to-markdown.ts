import mammoth from "mammoth";
import TurndownService from "turndown";
import { inspectDocxArchive, type DocxArchiveRefusal } from "./docx-archive-guard";

/**
 * Convert a .docx file buffer to clean Markdown.
 * Uses mammoth (docx -> HTML) + turndown (HTML -> Markdown).
 */
export async function convertDocxToMarkdown(
  buffer: Buffer | ArrayBuffer
): Promise<string> {
  const input = Buffer.isBuffer(buffer)
    ? { buffer }
    : { buffer: Buffer.from(buffer) };

  const { value: html } = await mammoth.convertToHtml(input);

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // Remove empty paragraphs that mammoth sometimes produces
  turndown.addRule("removeEmptyParagraphs", {
    filter: (node) =>
      node.nodeName === "P" && node.textContent?.trim() === "",
    replacement: () => "\n",
  });

  const markdown = turndown.turndown(html);

  // Clean up excessive blank lines
  return markdown.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export { inspectDocxArchive } from "./docx-archive-guard";
export type { DocxArchiveRefusal } from "./docx-archive-guard";

/** A conversion running longer than this answers 422 instead of holding the request. */
export const DOCX_CONVERSION_TIMEOUT_MS = 30_000;

export type DocxConversionResult =
  | { ok: true; markdown: string }
  | { ok: false; code: DocxArchiveRefusal | "CONVERSION_TIMEOUT" };

interface ConvertDocxOptions {
  timeoutMs?: number;
  /** Injected in tests; the real converter otherwise. */
  convert?: (buffer: Buffer) => Promise<string>;
}

const TIMED_OUT = Symbol("timed-out");

/**
 * P1-24: inspect the archive before anything inflates it, then convert under
 * a time limit. A document mammoth cannot read is NOT_A_DOCX; the reason stays
 * in the server log, not in the writer's warning.
 */
export async function convertDocxSafely(
  input: Buffer | ArrayBuffer,
  options: ConvertDocxOptions = {}
): Promise<DocxConversionResult> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const inspection = await inspectDocxArchive(buffer);
  if (!inspection.ok) return inspection;

  const convert = options.convert ?? convertDocxToMarkdown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), options.timeoutMs ?? DOCX_CONVERSION_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([convert(buffer), timeout]);
    return result === TIMED_OUT
      ? { ok: false, code: "CONVERSION_TIMEOUT" }
      : { ok: true, markdown: result };
  } catch (error) {
    console.error("[import] DOCX conversion failed:", error);
    return { ok: false, code: "NOT_A_DOCX" };
  } finally {
    clearTimeout(timer);
  }
}
