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
  | { ok: false; code: DocxArchiveRefusal | "CONVERSION_TIMEOUT" | "RATE_LIMITED" };

/** Review M-2: conversions one writer may have running at once in this process. */
export const DOCX_MAX_CONCURRENT_PER_WRITER = 2;
const running = new Map<string, number>();

function takeSlot(key: string): boolean {
  const now = running.get(key) ?? 0;
  if (now >= DOCX_MAX_CONCURRENT_PER_WRITER) return false;
  running.set(key, now + 1);
  return true;
}

function releaseSlot(key: string): void {
  const now = (running.get(key) ?? 1) - 1;
  if (now <= 0) running.delete(key);
  else running.set(key, now);
}

interface ConvertDocxOptions {
  timeoutMs?: number;
  /** Injected in tests; the real converter otherwise. */
  convert?: (buffer: Buffer) => Promise<string>;
  /** The writer: at most DOCX_MAX_CONCURRENT_PER_WRITER conversions run at once. */
  slotKey?: string;
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
  const slot = options.slotKey;
  if (slot !== undefined && !takeSlot(slot)) return { ok: false, code: "RATE_LIMITED" };
  // The slot covers the inspection and the conversion, and is released only
  // when the conversion really stops: a timed-out mammoth run keeps working.
  let released = false;
  const release = () => {
    if (slot !== undefined && !released) {
      released = true;
      releaseSlot(slot);
    }
  };

  const inspection = await inspectDocxArchive(buffer);
  if (!inspection.ok) {
    release();
    return inspection;
  }

  const convert = options.convert ?? convertDocxToMarkdown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), options.timeoutMs ?? DOCX_CONVERSION_TIMEOUT_MS);
  });
  const conversion = convert(buffer);
  conversion.then(release, release);
  try {
    const result = await Promise.race([conversion, timeout]);
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
