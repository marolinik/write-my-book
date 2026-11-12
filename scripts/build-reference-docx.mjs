/**
 * P2-73: build export-templates/reference-genre.docx, the DOCX reference the
 * export pipeline loads by default. Without it pandoc synthesized every custom
 * style the Lua filters ask for from "Normal", so scene breaks, epigraphs and
 * letters came out unstyled.
 *
 * Starts from pandoc's own default reference.docx (so every built-in style is
 * there) and adds one paragraph style per custom style the filters use.
 *
 *   node scripts/build-reference-docx.mjs        # needs pandoc on PATH
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

const OUT = join(process.cwd(), "export-templates", "reference-genre.docx");

/** name -> paragraph properties (pPr) and run properties (rPr) XML. */
const STYLES = {
  "Scene Break": {
    pPr: '<w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/>',
    rPr: "",
  },
  Epigraph: {
    pPr: '<w:ind w:left="1440" w:right="1440" w:firstLine="0"/><w:spacing w:before="120" w:after="60"/>',
    rPr: "<w:i/>",
  },
  "Epigraph Attribution": {
    pPr: '<w:jc w:val="right"/><w:ind w:right="1440" w:firstLine="0"/><w:spacing w:after="360"/>',
    rPr: "",
  },
  Letter: {
    pPr: '<w:ind w:left="720" w:right="720" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>',
    rPr: "<w:i/>",
  },
  "Text Message": {
    pPr: '<w:ind w:left="1080" w:firstLine="0"/><w:spacing w:before="60" w:after="60"/>',
    rPr: '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/>',
  },
  "Journal Entry": {
    pPr: '<w:ind w:left="720" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>',
    rPr: "<w:i/>",
  },
  "Document Insert": {
    pPr: '<w:ind w:left="720" w:right="720" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>',
    rPr: '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/>',
  },
  Telegram: {
    pPr: '<w:ind w:left="720" w:right="720" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>',
    rPr: '<w:caps/><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>',
  },
};

const styleId = (name) => name.replace(/[^A-Za-z0-9]/g, "");

const base = execFileSync("pandoc", ["--print-default-data-file", "reference.docx"], { maxBuffer: 20 * 1024 * 1024 });
const zip = await JSZip.loadAsync(base);
let styles = await zip.file("word/styles.xml").async("string");

for (const [name, { pPr, rPr }] of Object.entries(STYLES)) {
  const id = styleId(name);
  if (styles.includes(`w:styleId="${id}"`)) continue;
  const xml =
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}">` +
    `<w:name w:val="${name}"/><w:basedOn w:val="BodyText"/><w:next w:val="BodyText"/><w:qFormat/>` +
    `<w:pPr>${pPr}</w:pPr>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;
  styles = styles.replace("</w:styles>", `${xml}</w:styles>`);
}

zip.file("word/styles.xml", styles);
const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(OUT, out);
console.log(`[build-reference-docx] wrote ${OUT} with ${Object.keys(STYLES).length} custom styles`);
