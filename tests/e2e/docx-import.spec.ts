import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { createBookViaApi, uniqueName } from "./fixtures";

/**
 * P2-68 (Wave 5 Task 10): no e2e ever uploaded a file. This builds a genuine
 * Word document, uploads it to the preview, confirms the import, and checks
 * the chapters the server stored — titles and word counts — over real HTTP.
 * Self-contained: it creates its own book.
 */
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const heading = (text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

async function wordDocument(): Promise<Buffer> {
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
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${
      heading("The Harbor") +
      para("The tide kept the letters where the harbor wall met the sea.") +
      heading("Pismo") +
      para("Šum mora i pisma koja niko nije tražio.") +
      heading("The Return") +
      para("She came back in winter and read them all.")
    }</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const TITLES = ["The Harbor", "Pismo", "The Return"];

test("a Word document is previewed, imported and stored with its chapters and word counts", async ({ request }) => {
  const book = await createBookViaApi(request, { name: uniqueName("DOCX Import Book") });

  const preview = await request.post(`/api/books/${book.id}/import/preview`, {
    multipart: {
      files: {
        name: "manuscript.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: await wordDocument(),
      },
    },
  });
  expect(preview.status()).toBe(200);
  const { chapters } = (await preview.json()) as { chapters: Array<{ title: string; content: string; wordCount: number; number: number }> };
  expect(chapters.map((c) => c.title)).toEqual(TITLES);
  expect(chapters.every((c) => c.wordCount > 0)).toBe(true);

  const confirm = await request.post(`/api/books/${book.id}/import`, {
    data: {
      chapters: chapters.map((c, i) => ({ number: i + 1, title: c.title, content: c.content, action: "create" })),
    },
  });
  expect(confirm.status()).toBe(200);

  const stored = await request.get(`/api/books/${book.id}/chapters`);
  expect(stored.status()).toBe(200);
  const rows = (await stored.json()) as Array<{ chapterNumber: number; title: string | null; wordCount: number }>;
  const byNumber = rows.sort((a, b) => a.chapterNumber - b.chapterNumber).slice(0, 3);
  expect(byNumber.map((r) => r.title)).toEqual(TITLES);
  expect(byNumber.every((r) => r.wordCount > 0)).toBe(true);

  await request.delete(`/api/books/${book.id}`);
});
