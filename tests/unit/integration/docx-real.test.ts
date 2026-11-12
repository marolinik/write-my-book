// P2-68 (Wave 5 Task 9): DOCX import never parsed a real document —
// convertDocxToMarkdown was mocked in every import test. This builds a small
// but genuine Word document (styles, headings, Cyrillic, a Chinese line) and
// runs the real converter and the real chapter parser on it.
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { convertDocxSafely } from "@/lib/import-export/docx-to-markdown";
import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const heading = (text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

async function docx(body: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`
  );
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("a real Word document through the real converter", () => {
  it("keeps chapter count, heading order and every script, with no mojibake", async () => {
    const buffer = await docx(
      heading("Прво поглавље") +
        para("Писма су остала у луци. Šum mora, čežnja, đak.") +
        heading("The Second Chapter") +
        para("She folded the letter twice.") +
        heading("第三章") +
        para("她把信放进抽屉里，然后关上了灯。")
    );
    const converted = await convertDocxSafely(buffer);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const md = converted.markdown;

    expect(md).toContain("Писма су остала у луци.");
    expect(md).toContain("Šum mora, čežnja, đak.");
    expect(md).toContain("她把信放进抽屉里");
    expect(md).not.toMatch(/Ð|Ã|â€|�/); // the classic double-encoding marks

    const chapters = parseManuscriptChapters(md);
    expect(chapters.map((c) => c.title)).toEqual(["Прво поглавље", "The Second Chapter", "第三章"]);
    expect(chapters.every((c) => c.wordCount > 0)).toBe(true);
    // CJK counted per character (P2-47): 14 Han characters in the last chapter's body.
    expect(chapters[2].wordCount).toBeGreaterThanOrEqual(14);
  });

  it("a zip that is not a Word document is refused, not converted", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a document");
    const converted = await convertDocxSafely(await zip.generateAsync({ type: "nodebuffer" }));
    expect(converted).toEqual({ ok: false, code: "NOT_A_DOCX" });
  });
});
