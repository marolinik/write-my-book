import JSZip from "jszip";
import { readFileSync } from "fs";
import { join } from "path";
import { saveJson, flushTraces, pushTrace } from "./lib";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";

// Normalize smart-quotes / dashes so pandoc typesetting can't cause false diffs.
function norm(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—‒―]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlText(xml: string): string {
  // strip tags -> visible text
  return xml.replace(/<[^>]+>/g, " ");
}

async function main() {
  const expected = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "expected-chapters.json"), "utf-8"));
  const bookName: string = expected.bookName;
  const allSentinels: string[] = expected.chapters.flatMap((c: any) => c.sentinels);
  const chapterTitles: string[] = expected.chapters.map((c: any) => c.title);

  const report: any = { bookName, docx: {}, epub: {} };

  // ---------- DOCX ----------
  {
    const buf = readFileSync(join(BUNDLE, "artifacts", "export.docx"));
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    const bodyText = norm(xmlText(docXml));
    // metadata title
    const coreXml = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
    const titleMatch = coreXml.match(/<dc:title>([\s\S]*?)<\/dc:title>/);
    const metaTitle = titleMatch ? titleMatch[1] : null;

    const missingSent = allSentinels.filter((s) => !bodyText.includes(s));
    const missingTitles = chapterTitles.filter((t) => !bodyText.includes(norm(t)));
    // Verify sentinel ORDER (Zk01Alpha before Zk01Omega before Zk02Alpha ...)
    const positions = allSentinels.map((s) => ({ s, i: bodyText.indexOf(s) }));
    let orderOk = true;
    for (let k = 1; k < positions.length; k++) {
      if (positions[k].i >= 0 && positions[k - 1].i >= 0 && positions[k].i < positions[k - 1].i) { orderOk = false; break; }
    }
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

    report.docx = {
      documentXmlChars: docXml.length,
      decompressedBodyWords: wordCount,
      metaTitleRaw: metaTitle,
      metaTitleMatchesBookName: metaTitle ? norm(metaTitle) === norm(bookName) : false,
      sentinelsExpected: allSentinels.length,
      sentinelsMissing: missingSent,
      sentinelsAllPresent: missingSent.length === 0,
      chapterTitlesMissing: missingTitles,
      chapterTitlesAllPresent: missingTitles.length === 0,
      sentinelOrderPreserved: orderOk,
    };
    pushTrace({ label: "docx-analyze", method: "LOCAL", url: "artifacts/export.docx", status: 200, ok: missingSent.length === 0,
      note: `decompressed word/document.xml = ${docXml.length} chars, ${wordCount} words; metaTitle=${metaTitle}` });
  }

  // ---------- EPUB ----------
  {
    const buf = readFileSync(join(BUNDLE, "artifacts", "export.epub"));
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    // OPF metadata title
    const opfName = names.find((n) => /\.opf$/i.test(n));
    const opfXml = opfName ? await zip.file(opfName)!.async("string") : "";
    const opfTitleMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
    const opfTitle = opfTitleMatch ? opfTitleMatch[1] : null;

    // Concatenate all xhtml body text.
    let bodyAll = "";
    const perFile: any[] = [];
    const titlesFound: string[] = [];
    for (const n of names) {
      if (!/\.x?html$/i.test(n)) continue;
      const raw = await zip.file(n)!.async("string");
      const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const body = norm(xmlText(bodyMatch ? bodyMatch[1] : raw));
      const words = body.split(/\s+/).filter(Boolean).length;
      // <head><title>
      const tMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (tMatch) titlesFound.push(norm(tMatch[1]));
      perFile.push({ name: n, bodyWords: words });
      bodyAll += " " + body;
    }
    bodyAll = norm(bodyAll);
    const missingSent = allSentinels.filter((s) => !bodyAll.includes(s));
    const missingTitles = chapterTitles.filter((t) => !bodyAll.includes(norm(t)));
    const wordCount = bodyAll.split(/\s+/).filter(Boolean).length;

    report.epub = {
      opfTitleRaw: opfTitle,
      opfTitleMatchesBookName: opfTitle ? norm(opfTitle) === norm(bookName) : false,
      totalBodyWords: wordCount,
      xhtmlFiles: perFile.length,
      perFile,
      xhtmlHeadTitles: titlesFound,
      sentinelsExpected: allSentinels.length,
      sentinelsMissing: missingSent,
      sentinelsAllPresent: missingSent.length === 0,
      chapterTitlesMissing: missingTitles,
      chapterTitlesAllPresent: missingTitles.length === 0,
    };
    pushTrace({ label: "epub-analyze", method: "LOCAL", url: "artifacts/export.epub", status: 200, ok: missingSent.length === 0,
      note: `opfTitle=${opfTitle}; totalBodyWords=${wordCount}; xhtmlFiles=${perFile.length}` });
  }

  saveJson("docx-epub-analysis.json", report);
  console.log("DOCX:", JSON.stringify(report.docx, null, 2));
  console.log("EPUB summary:", JSON.stringify({ ...report.epub, perFile: `[${report.epub.perFile.length} files]` }, null, 2));
  flushTraces("03-docx-epub-analyze.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
