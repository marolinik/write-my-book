/**
 * Shots 44p1 / 44p2 / 44p3 — Gerald's FIRST AI TOUCH, re-probed on the current build.
 *
 * At the 07-20 re-judge Gerald's very first AI interaction returned an honest 502
 * ("The suggestion cut off before any text was produced") because his default model,
 * `openrouter-qwen36/sonnet`, is a REASONING model (D-100 / D-116 family). `d51514c`
 * routes quick-assist around reasoning models and `01192a3` streams ghost-text through
 * a first-text-gate SSE. This re-runs that exact moment on the same account and the
 * same default model, in the browser, and records whatever actually happens.
 *
 *   44p1  ghost-text rendered inline as Gerald pauses (streamed), with the felt-latency chip
 *   44p2  the suggestion accepted into his prose (Tab)
 *   44p3  inline edit ("AI rewrite") on a selected sentence — suggestion(s) rendered
 *
 * Prose safety: runs on a fresh P2-CAPTURE-QUICKASSIST-* book seeded with a copied
 * excerpt of Gerald's own chapter 1 (unicode + em dashes + curly quotes intact), so the
 * 40K canonical manuscript is never mutated.
 *
 * Usage: npx tsx --env-file=.env shot44p-quickassist.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const CANON = "636a1f02-8520-4b66-8e78-08c8e0fee5f0";
const CANON_CH1 = "468cecc8-3d4f-49fb-87df-2fb096529e18";
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }
const HIDE = "nextjs-portal{display:none !important}";
const log: string[] = [];
const say = (m: string) => { const l = `[${new Date().toISOString()}] ${m}`; log.push(l); console.log(l); };

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...H, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const t = await r.text();
  let j: unknown = null; try { j = JSON.parse(t); } catch { /* */ }
  return { status: r.status, json: j as never, text: t };
}

(async () => {
  const stamp = Date.now();
  // Copy ~1,200 chars of Gerald's own prose so voice/unicode integrity is testable.
  const canon = await api(`/api/books/${CANON}/chapters/${CANON_CH1}/content`);
  const canonMd: string = ((canon.json as { markdown?: string })?.markdown ?? "");
  const excerpt = canonMd.split("\n\n").slice(0, 3).join("\n\n").slice(0, 1400);
  say(`excerpt from canonical ch1: ${excerpt.length} chars`);

  const mk = await api("/api/books", { method: "POST", body: JSON.stringify({ name: `P2-CAPTURE-QUICKASSIST-${stamp}`, genre: "Thriller", language: "en" }) });
  const bookId = (mk.json as { id: string; firstChapterId: string }).id;
  const chapterId = (mk.json as { firstChapterId: string }).firstChapterId;
  await api(`/api/books/${bookId}/chapters/${chapterId}/content`, { method: "PUT", body: JSON.stringify({ markdown: excerpt }) });
  say(`quick-assist fixture book=${bookId} chapter=${chapterId}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, extraHTTPHeaders: H });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/ghost-text") || u.includes("/quick-assist") || u.includes("/inline-edit") || u.includes("/agent")) {
      net.push({ url: u.replace(BASE, ""), method: r.request().method(), status: r.status(), at: new Date().toISOString(), ct: r.headers()["content-type"] ?? null });
    }
  });

  await page.goto(`${BASE}/books/${bookId}/chapters/${chapterId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2500);

  // Ghost text ships OFF by default (editor-store.ts:96) — the writer opts in from the
  // toolbar. Turn it on the way a writer would, and record that it is opt-in.
  const ghostToggle = page.getByRole("button", { name: "AI Ghost Text (off)" });
  const ghostWasOff = await ghostToggle.isVisible().catch(() => false);
  say(`ghost text default state = ${ghostWasOff ? "OFF (opt-in)" : "already on"}`);
  if (ghostWasOff) { await ghostToggle.click(); await page.waitForTimeout(1200); }

  // ---- 44p1: type, then STOP. 1.5 s pause arms the ghost fetch.
  const ed = page.locator(".ProseMirror");
  await ed.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Marek set the receipt on the table and", { delay: 25 });
  const tPause = Date.now();
  let ghostText = "";
  let ghostRenderedMs: number | null = null;
  try {
    await page.waitForFunction(() => {
      const nodes = Array.from(document.querySelectorAll("span.fixed, div.fixed"));
      return nodes.some((n) => {
        const el = n as HTMLElement;
        return el.className.includes("italic") && (el.innerText ?? "").trim().length > 3;
      });
    }, undefined, { timeout: 120000 });
    ghostRenderedMs = Date.now() - tPause;
    ghostText = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("span.fixed, div.fixed"));
      const el = nodes.find((n) => (n as HTMLElement).className.includes("italic")) as HTMLElement | undefined;
      return el?.innerText ?? "";
    });
    say(`ghost text rendered ${ghostRenderedMs}ms after the typing pause: ${JSON.stringify(ghostText.slice(0, 200))}`);
  } catch {
    say("ghost text did NOT render within 120s of the pause — capturing whatever the writer sees instead");
  }
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44p1-ghost-text-on-gerald-model.png`, fullPage: false });

  // ---- 44p2: accept with Tab
  let acceptedText = "";
  const before = await ed.innerText();
  if (ghostRenderedMs !== null) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(2000);
    acceptedText = await ed.innerText();
    say(`accept via Tab changed the prose = ${acceptedText !== before}`);
  }
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44p2-ghost-accepted.png`, fullPage: false });

  // ---- 44p3: inline edit ("AI rewrite") on a selected sentence
  let inlineOk = false; let inlineText = "";
  try {
    // Real keyboard selection so ProseMirror's own selection state updates, then F2
    // (the documented inline-edit shortcut: "Select some text first, then press F2").
    await ed.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(700);
    const t3 = Date.now();
    await page.keyboard.press("F2");
    await page.waitForTimeout(1500);
    // Use the free-form intent box so the request is deterministic.
    const box = page.getByPlaceholder("Or describe what you want...");
    if (await box.isVisible().catch(() => false)) {
      await box.fill("Tighten this passage without changing the voice or any proper noun.");
      await box.press("Enter");
    }
    await page.waitForFunction(() => /Suggestion|Replace|Apply|Accept/i.test(document.body.innerText), undefined, { timeout: 180000 });
    inlineOk = true;
    say(`inline edit returned in ${Date.now() - t3}ms`);
    await page.waitForTimeout(1500);
    inlineText = await page.locator("body").innerText();
  } catch (e) {
    say(`inline edit leg did not complete: ${String(e).slice(0, 200)}`);
  }
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${outDir}/44p3-inline-edit-suggestion.png`, fullPage: false });

  writeFileSync(`${outDir}/44p-quickassist-assertions.json`, JSON.stringify({
    shot: "44p1-44p3",
    dims: "D1 / D5 / D8 / D10 — Gerald's first AI touch, post-d51514c + 01192a3",
    capturedAt: new Date().toISOString(),
    identity: "user_qa_p2 (default_model openrouter-qwen36/sonnet, BYOK openrouter, validated)",
    fixture: { bookId, chapterId, seededFrom: "canonical ch1 excerpt", excerptChars: excerpt.length },
    priorArtOfRecord: "07-20 re-judge: first AI touch = honest 502 'The suggestion cut off before any text was produced' (35-ai-touch.txt)",
    assertions: {
      ghost_text_rendered: ghostRenderedMs !== null,
      ghost_render_ms_after_pause: ghostRenderedMs,
      ghost_text_verbatim: ghostText,
      ghost_accept_changed_prose: ghostRenderedMs !== null ? acceptedText !== before : null,
      inline_edit_completed: inlineOk,
    },
    editorTextBeforeAccept: before,
    editorTextAfterAccept: acceptedText,
    network: net,
    log,
  }, null, 2), "utf8");
  await browser.close();
})();
