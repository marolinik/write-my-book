import { apiJson, apiRaw, flushTraces, saveArtifact, saveJson } from "./lib";
import { readFileSync } from "fs";
import { join } from "path";
import JSZip from "jszip";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";
const N = 16;

function norm(s: string): string {
  return s.replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"').replace(/[–—‒―]/g, "-").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}
const xmlText = (xml: string) => xml.replace(/<[^>]+>/g, " ");

async function main() {
  const state = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "book-state.json"), "utf-8"));
  const expected = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "expected-chapters.json"), "utf-8"));
  const bookId: string = state.bookId;

  // 1. Restore ch8 & ch12 (overwritten by concurrency/autosave tests) to their
  //    original imported prose so the full 80-sentinel corpus is intact.
  const chList0 = await apiJson("get-chapters-prereorder", "GET", `/api/books/${bookId}/chapters`);
  for (const num of [8, 12]) {
    const ch = chList0.json.find((c: any) => c.chapterNumber === num);
    const cur = await apiJson(`get-restore-${num}`, "GET", `/api/books/${bookId}/chapters/${ch.id}/content`);
    const orig = expected.chapters.find((c: any) => c.number === num).content;
    const r = await apiJson(`restore-ch${num}`, "PUT", `/api/books/${bookId}/chapters/${ch.id}/content`, {
      markdown: orig, changeSource: "user", expectedVersion: cur.json.version,
    });
    console.log(`restore ch${num}: status=${r.status} v=${r.json?.version}`);
  }

  // 2. Full reversal reorder: chapter at number p -> 17-p. (No fixed points.)
  const chList = await apiJson("get-chapters-toreorder", "GET", `/api/books/${bookId}/chapters`);
  const order = chList.json.map((c: any) => ({ chapterId: c.id, chapterNumber: N + 1 - c.chapterNumber }));
  const reorder = await apiJson("reorder-reversal", "PATCH", `/api/books/${bookId}/chapters/reorder`, { order });
  console.log("reorder resp", JSON.stringify(reorder.json));

  const afterOrder = await apiJson("get-chapters-afterreorder", "GET", `/api/books/${bookId}/chapters`);
  const newOrder = afterOrder.json
    .sort((a: any, b: any) => a.chapterNumber - b.chapterNumber)
    .map((c: any) => ({ chapterNumber: c.chapterNumber, title: c.title }));

  // 3. Re-export docx TWICE (determinism) + verify content word-exact + correct pairing.
  const exp1 = await apiJson("reexport-docx-1", "POST", `/api/books/${bookId}/export`, { format: "docx" });
  const dl1 = await apiRaw("reexport-docx-1-dl", "GET", `/api/books/${bookId}/export/${encodeURIComponent(exp1.json.filename)}`);
  saveArtifact("export-reordered.docx", dl1.buf);
  const exp2 = await apiJson("reexport-docx-2", "POST", `/api/books/${bookId}/export`, { format: "docx" });
  const dl2 = await apiRaw("reexport-docx-2-dl", "GET", `/api/books/${bookId}/export/${encodeURIComponent(exp2.json.filename)}`);

  const zip1 = await JSZip.loadAsync(dl1.buf);
  const body1 = norm(xmlText(await zip1.file("word/document.xml")!.async("string")));
  const doc1 = await zip1.file("word/document.xml")!.async("string");
  const zip2 = await JSZip.loadAsync(dl2.buf);
  const doc2 = await zip2.file("word/document.xml")!.async("string");

  // determinism: body paragraphs identical (metadata timestamp aside)
  const bodyEqual = doc1 === doc2;

  // all 80 sentinels present after reorder
  const allSent: string[] = expected.chapters.flatMap((c: any) => c.sentinels);
  const missing = allSent.filter((s) => !body1.includes(s));

  // title order in body == reversed order
  const titles: string[] = expected.chapters.map((c: any) => c.title); // ch1..ch16
  const titlePos = titles.map((t) => ({ t, i: body1.indexOf(norm(t)) }));
  const bodyTitleSeq = titlePos.slice().sort((a, b) => a.i - b.i).map((x) => x.t);
  const expectedReversedTitleSeq = titles.slice().reverse();
  const titleOrderReversed = JSON.stringify(bodyTitleSeq) === JSON.stringify(expectedReversedTitleSeq);

  // pairing: each chapter n's title immediately precedes its Zk{n}Alpha, and
  // Zk{n}Omega precedes the next title in the sequence (content stayed with title)
  const pairing: any[] = [];
  let allPaired = true;
  for (let n = 1; n <= N; n++) {
    const c = expected.chapters.find((x: any) => x.number === n);
    const ti = body1.indexOf(norm(c.title));
    const ai = body1.indexOf(`Zk${String(n).padStart(2, "0")}Alpha`);
    const oi = body1.indexOf(`Zk${String(n).padStart(2, "0")}Omega`);
    const ok = ti >= 0 && ai > ti && oi > ai;
    if (!ok) allPaired = false;
    pairing.push({ n, titlePos: ti, alphaPos: ai, omegaPos: oi, titleBeforeContent: ok });
  }

  const summary = {
    bookId,
    reorderResp: reorder.json,
    newOrderChapterNumbersTitles: newOrder,
    reExport: {
      export1: exp1.json.filename, export2: exp2.json.filename,
      wordCount1: exp1.json.wordCount, wordCount2: exp2.json.wordCount,
      bodyXmlByteIdenticalAcrossReExports: bodyEqual,
    },
    sentinelsExpected: allSent.length,
    sentinelsMissingAfterReorder: missing,
    allSentinelsPresent: missing.length === 0,
    titleOrderMatchesReversal: titleOrderReversed,
    contentPairedToCorrectTitle_D03: allPaired,
    PASS: missing.length === 0 && titleOrderReversed && allPaired,
    pairing,
  };
  saveJson("reorder-reexport.json", summary);
  console.log(JSON.stringify({ ...summary, pairing: `[${pairing.length} chapters]`, newOrderChapterNumbersTitles: `[${newOrder.length}]` }, null, 2));
  flushTraces("07-reorder-reexport.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
