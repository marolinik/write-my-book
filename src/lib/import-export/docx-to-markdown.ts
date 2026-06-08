import mammoth from "mammoth";
import TurndownService from "turndown";

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
