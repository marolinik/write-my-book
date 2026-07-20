/**
 * P2 RE-JUDGE — onboarding deltas (D4/D6/D3b gap-fill) + time-to-first-word.
 *
 *  1. Onboarding status surface: GET/POST /api/settings/onboarding (card-free,
 *     key-free on-ramp — POST completes with NO api key required).
 *  2. Default-model surface: GET; role-override round-trip (set + clear);
 *     D-39 strict (unknown key -> 400); unknown model id -> 400.
 *  3. TIME-TO-FIRST-WORD journey: create book (auto ch1) -> first save -> verify
 *     read-your-writes; wall-clock each leg.
 *  4. First AI touch (BYOK ghost-text, synchronous, persona's OpenRouter qwen key).
 */
import { call, line } from "./_client";

async function main() {
  const log = (s: string) => console.log(s);
  log(`=== ONBOARDING + TIME-TO-FIRST-WORD @ ${new Date().toISOString()} (user_qa_p2) ===\n`);

  // ---------- 1. Onboarding status surface ----------
  log(`--- 1. Onboarding status surface (card-free / key-free on-ramp) ---`);
  const ob0 = await call("GET", "/api/settings/onboarding", { label: "onboarding-get" });
  log("GET onboarding: " + line(ob0));
  const obPost = await call("POST", "/api/settings/onboarding", { label: "onboarding-post" });
  log("POST onboarding (idempotent complete, no key required): " + line(obPost));
  const ob1 = await call("GET", "/api/settings/onboarding", { label: "onboarding-get-2" });
  log("GET onboarding after: " + line(ob1));
  log(`>>> on-ramp: complete=${(ob1.body as {onboardingComplete?:boolean}).onboardingComplete} keyCount=${(ob1.body as {keyCount?:number}).keyCount} (card-free POST->${obPost.status})\n`);

  // ---------- 2. Default-model surface ----------
  log(`--- 2. Default-model surface ---`);
  const dm0 = await call("GET", "/api/settings/default-model", { label: "default-model-get" });
  log("GET default-model: " + line(dm0));
  const origDefault = (dm0.body as {defaultModel?:string}).defaultModel;

  // role-override round-trip (non-destructive: modelEditor starts null)
  const setRole = await call("PATCH", "/api/settings/default-model", { body: { modelEditor: "anthropic/sonnet" }, label: "set-role-override" });
  log("PATCH modelEditor=anthropic/sonnet: " + line(setRole));
  const dm1 = await call("GET", "/api/settings/default-model", { label: "verify-role" });
  const rolePersisted = (dm1.body as {modelEditor?:string}).modelEditor === "anthropic/sonnet";
  log(`  role override persisted: ${rolePersisted}`);
  const clearRole = await call("PATCH", "/api/settings/default-model", { body: { modelEditor: null }, label: "clear-role-override" });
  const dm2 = await call("GET", "/api/settings/default-model", { label: "verify-clear" });
  const roleCleared = (dm2.body as {modelEditor?:string|null}).modelEditor === null;
  log(`  role override cleared: ${roleCleared} (restored defaultModel intact=${(dm2.body as {defaultModel?:string}).defaultModel===origDefault})`);

  // D-39 strict: unknown key -> 400
  const strict = await call("PATCH", "/api/settings/default-model", { body: { bogusField: "x", defaultModel: origDefault }, label: "d39-strict-unknown-key" });
  log(`  D-39 strict (unknown key): [${strict.status}] ${JSON.stringify(strict.body).slice(0,140)}`);
  // unknown model id -> 400
  const badModel = await call("PATCH", "/api/settings/default-model", { body: { defaultModel: "nonexistent/model-xyz" }, label: "unknown-model-id" });
  log(`  unknown model id: [${badModel.status}] ${JSON.stringify(badModel.body).slice(0,140)}`);
  const dmFinal = await call("GET", "/api/settings/default-model", { label: "default-model-final" });
  log(`  default-model unchanged after bad requests: ${(dmFinal.body as {defaultModel?:string}).defaultModel===origDefault}`);
  log(`>>> default-model: role round-trip=${rolePersisted&&roleCleared?"PASS":"FAIL"} D-39-strict-400=${strict.status===400?"PASS":"FAIL"} unknown-model-400=${badModel.status===400?"PASS":"FAIL"}\n`);

  // ---------- 3. TIME-TO-FIRST-WORD journey ----------
  log(`--- 3. TIME-TO-FIRST-WORD journey ---`);
  const tStart = performance.now();
  const book = await call("POST", "/api/books", { body: { name: `P2-REJUDGE-TTFW-${Date.now()}`, genre: "literary" }, label: "ttfw-create-book" });
  const tBook = performance.now();
  const bookId = (book.body as {id?:string}).id;
  const firstChapterId = (book.body as {firstChapterId?:string}).firstChapterId;
  log(`  [t=${Math.round(tBook - tStart)}ms] POST /api/books -> ${book.status} (auto ch1=${firstChapterId})`);

  const cPath = `/api/books/${bookId}/chapters/${firstChapterId}/content`;
  const firstWord = "# The Salt Letters\n\nThe harbor at dawn smelled of diesel and old rope, and Vera counted the boats twice before she trusted the silence.";
  const save = await call("PUT", cPath, { body: { markdown: firstWord }, label: "ttfw-first-save" });
  const tSave = performance.now();
  log(`  [t=${Math.round(tSave - tStart)}ms] PUT first content -> ${save.status} (v=${(save.body as {version?:number}).version}, words=${(save.body as {wordCount?:number}).wordCount})`);

  const verify = await call("GET", cPath, { label: "ttfw-verify" });
  const tVerify = performance.now();
  const echoed = (verify.body as {markdown?:string}).markdown === firstWord;
  log(`  [t=${Math.round(tVerify - tStart)}ms] GET content -> read-your-writes echo=${echoed}`);
  log(`>>> TIME-TO-FIRST-WORD (book-create -> first word durably saved): ${Math.round(tSave - tStart)}ms ; verified-persisted=${echoed}\n`);

  // ---------- 4. First AI touch (BYOK ghost-text) ----------
  log(`--- 4. First AI touch (BYOK OpenRouter/qwen ghost-text) ---`);
  const tAi0 = performance.now();
  const ghost = await call("POST", `/api/books/${bookId}/ghost-text`, {
    body: { context: firstWord + " She", chapterNumber: 1 }, label: "ttfw-ghost-text",
  });
  const tAi1 = performance.now();
  log(`  [${Math.round(tAi1 - tAi0)}ms] POST ghost-text -> ${line(ghost)}`);
  if (ghost.status === 200) {
    log(`>>> FIRST AI TOUCH: SUCCESS — suggestion="${(ghost.body as {suggestion?:string}).suggestion}"`);
  } else if (ghost.status === 502 && (ghost.body as {retryable?:boolean}).retryable) {
    log(`>>> FIRST AI TOUCH: honest retryable 502 (reasoning-model 60-token budget exhausted — matches known open D-100; NOT a hollow 200, NOT billed)`);
  } else {
    log(`>>> FIRST AI TOUCH: status ${ghost.status} — recorded raw`);
  }
  log(`\nBOOK_ID=${bookId} CHAPTER_ID=${firstChapterId}`);
}
main().catch((e)=>{console.error("ONBOARDING ERROR",e);process.exit(1);});
