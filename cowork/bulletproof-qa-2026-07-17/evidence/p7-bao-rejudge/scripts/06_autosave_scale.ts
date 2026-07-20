import { apiJson, flushTraces, saveJson } from "./lib";
import { readFileSync } from "fs";
import { join } from "path";

const BUNDLE = "D:/Projects/wmb-pub/cowork/bulletproof-qa-2026-07-17/evidence/p7-bao-rejudge";
const SAVES = 15;

async function main() {
  const state = JSON.parse(readFileSync(join(BUNDLE, "artifacts", "book-state.json"), "utf-8"));
  const bookId: string = state.bookId;
  const chList = await apiJson("get-chapters-autosave", "GET", `/api/books/${bookId}/chapters`);
  const ch = chList.json.find((c: any) => c.chapterNumber === 12);
  const chapterId = ch.id;

  const before = await apiJson("get-ch12-before-autosave", "GET", `/api/books/${bookId}/chapters/${chapterId}/content`);
  let version: number = before.json.version;

  // Simulate a long writing session: 15 sequential autosaves, content GROWS each
  // time (writer keeps typing). Each save stamps the running version. A single
  // dropped/овerwritten save would show as a missing AutosaveMark or a word-count
  // regression.
  const steps: any[] = [];
  let content = `# Autosave Scale Ch12\n\nAutosaveBase_Zk12`;
  const marks: string[] = [];
  let expectedWordsGrow = 0;
  for (let k = 1; k <= SAVES; k++) {
    const mark = `AutosaveMark_${String(k).padStart(2, "0")}_Zk12`;
    marks.push(mark);
    // append a diacritic-heavy paragraph plus the unique mark
    content += `\n\n${mark} São Café ő é ç ñ ø — paragraph ${k}: ${"Kőszeg várfal ködös hajnal ".repeat(20)}`;
    const res = await apiJson(`autosave-${k}`, "PUT", `/api/books/${bookId}/chapters/${chapterId}/content`, {
      markdown: content,
      changeSource: "user",
      expectedVersion: version,
    });
    if (res.status !== 200) {
      steps.push({ k, status: res.status, body: res.json, FAIL: true });
      console.error(`autosave ${k} FAILED status=${res.status}`, JSON.stringify(res.json));
      break;
    }
    steps.push({ k, status: res.status, newVersion: res.json.version, wordCount: res.json.wordCount, bookWordCount: res.json.bookWordCount });
    version = res.json.version;
  }

  // Read back final and verify word-exact equality to last-written content.
  const after = await apiJson("get-ch12-after-autosave", "GET", `/api/books/${bookId}/chapters/${chapterId}/content`);
  const savedContent: string = after.json.markdown;
  const allMarksPresent = marks.every((m) => savedContent.includes(m));
  // Order preserved
  let orderOk = true;
  let prev = -1;
  for (const m of marks) { const i = savedContent.indexOf(m); if (i < prev) { orderOk = false; break; } prev = i; }
  const exactMatch = savedContent === content;

  const summary = {
    bookId, chapterId,
    savesAttempted: SAVES,
    savesSucceeded: steps.filter((s) => s.status === 200).length,
    versionsMonotonic: steps.filter((s) => s.status === 200).map((s) => s.newVersion),
    finalVersion: after.json.version,
    allAutosaveMarksPresent: allMarksPresent,
    marksOrderPreserved: orderOk,
    finalContentExactMatchToLastWrite: exactMatch,
    finalContentChars: savedContent.length,
    lastWriteChars: content.length,
    PASS: allMarksPresent && orderOk && exactMatch && steps.filter((s) => s.status === 200).length === SAVES,
    steps,
  };
  saveJson("autosave-scale.json", summary);
  console.log(JSON.stringify({ ...summary, steps: `[${steps.length} steps]` }, null, 2));
  flushTraces("06-autosave-scale.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
