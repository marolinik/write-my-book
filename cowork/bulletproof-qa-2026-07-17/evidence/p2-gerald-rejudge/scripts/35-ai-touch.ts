/**
 * P2 RE-JUDGE — BYOK AI on-ramp control: inline-edit (max_tokens 4096) on the
 * same OpenRouter/qwen key that 502'd on ghost-text (60 tokens). Isolates the
 * known D-100 to the tiny-budget ghost-text path vs "BYOK AI broken".
 */
import { call, line } from "./_client";

async function main() {
  const log = (s: string) => console.log(s);
  log(`=== BYOK AI on-ramp control (inline-edit) @ ${new Date().toISOString()} ===\n`);
  const book = await call("POST", "/api/books", { body: { name: `P2-REJUDGE-AITOUCH-${Date.now()}`, genre: "literary" } });
  const bookId = (book.body as {id?:string}).id;
  const ch1 = (book.body as {firstChapterId?:string}).firstChapterId;
  const prose = "The harbor at dawn smelled of diesel and old rope, and Vera counted the boats twice before she trusted the silence.";
  await call("PUT", `/api/books/${bookId}/chapters/${ch1}/content`, { body: { markdown: `# Ch1\n\n${prose}` } });
  log(`book=${bookId} prose saved.`);

  const t0 = performance.now();
  const edit = await call("POST", `/api/books/${bookId}/inline-edit`, {
    body: {
      selectedText: "Vera counted the boats twice before she trusted the silence.",
      surroundingContext: prose,
      instruction: "tighten and sharpen the imagery",
      count: 3,
    },
    label: "inline-edit-ai-touch",
  });
  const dt = Math.round(performance.now() - t0);
  log(`\n[${dt}ms] POST inline-edit -> [${edit.status}]`);
  if (edit.status === 200) {
    const s = (edit.body as { suggestions?: { text: string; label: string }[] }).suggestions ?? [];
    log(`>>> BYOK AI ON-RAMP: SUCCESS — ${s.length} suggestions returned:`);
    s.forEach((x, i) => log(`   [${i}] (${x.label}) ${x.text}`));
    log(`\nCONCLUSION: BYOK AI produces real first-result via inline-edit (4096-tok budget);`);
    log(`the ghost-text 502 is isolated to the 60-token budget on a reasoning model (D-100).`);
  } else {
    log(`>>> BYOK AI ON-RAMP: [${edit.status}] ${line(edit)}`);
  }
}
main().catch((e)=>{console.error("AI-TOUCH ERROR",e);process.exit(1);});
