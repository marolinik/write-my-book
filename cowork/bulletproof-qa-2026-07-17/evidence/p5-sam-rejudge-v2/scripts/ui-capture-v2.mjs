// P5 Sam re-judge v2 — Playwright UI capture at 390x844 (phone-first), AS Sam.
// Persona identity applied at the network layer via extraHTTPHeaders (same pattern
// as playwright.config.ts / the v1 harness). Secret read from process.env, never
// printed. Captures:
//   (D-95) onboarding screen 1 privacy copy (screenshot + rendered text; asserts the
//          old false "never stores or processes ... on our servers" is ABSENT)
//   (D-92) live /settings/billing page (what Sam sees now that the API 500s)
//   (editor) /books/:id/chapters/:chapterId writing surface with content + a LIVE
//          in-page ghost-text fetch (records the exact status/body the editor hook
//          receives right now).
// Run:  node --env-file=.env ui-capture-v2.mjs <OUT_ROOT> <bookId> <chapterId>
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2] || ".";
const bookId = process.argv[3] || null;
const chapterId = process.argv[4] || null;
const SHOTS = join(OUT, "screenshots");
const TRACES = join(OUT, "api-traces");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(TRACES, { recursive: true });
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(2); }

const VP = { width: 390, height: 844 };
const capture = {};
const log = [];

async function settle(page, ms = 1800) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(ms);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK_ID },
  });
  const page = await context.newPage();

  // ---- (D-95) Onboarding screen 1 privacy copy ----
  try {
    await page.goto(BASE + "/onboarding", { waitUntil: "domcontentloaded" });
    await settle(page, 2200);
    await page.screenshot({ path: join(SHOTS, "onboarding-step1-privacy_390x844.png"), fullPage: true });
    const info = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      // find the three value-prop headings + their descriptions
      const props = {};
      for (const label of ["Bring Your Own Keys", "Your Writing Stays Yours", "Full Cost Control", "Your Data Stays Private"]) {
        const el = Array.from(document.querySelectorAll("p, h1, h2, h3")).find((n) => (n.textContent || "").trim() === label);
        if (el) {
          const desc = el.parentElement ? el.parentElement.innerText.trim() : el.textContent.trim();
          props[label] = desc;
        }
      }
      return {
        hasWritingStaysYours: /Your Writing Stays Yours/i.test(bodyText),
        hasEncryptedAtRest: /stored encrypted at rest and sent only to/i.test(bodyText),
        hasNeverTrain: /never use your content to\s+train AI models/i.test(bodyText),
        // the OLD false claim that D-95 removed — must be ABSENT
        hasOldFalseClaim: /never stores or processes your content on our servers/i.test(bodyText),
        props,
      };
    });
    capture.onboardingPrivacy = info;
    log.push(`[D-95] WritingStaysYours=${info.hasWritingStaysYours} encryptedAtRest=${info.hasEncryptedAtRest} neverTrain=${info.hasNeverTrain} OLD_FALSE_CLAIM=${info.hasOldFalseClaim}`);
  } catch (e) {
    capture.onboardingPrivacy = { error: String(e).slice(0, 300) };
    log.push(`[D-95] error: ${String(e).slice(0, 200)}`);
  }

  // ---- (D-92) Live billing page (what Sam sees now the API 500s) ----
  try {
    await page.goto(BASE + "/settings/billing", { waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    await page.screenshot({ path: join(SHOTS, "billing-page-live_390x844.png"), fullPage: true });
    const billing = await page.evaluate(() => ({
      bodyTextSample: document.body.innerText.slice(0, 1200),
      hasError: /error|failed|something went wrong|unable/i.test(document.body.innerText),
    }));
    capture.billingPage = billing;
    log.push(`[D-92 billing UI] hasError=${billing.hasError}`);
  } catch (e) {
    capture.billingPage = { error: String(e).slice(0, 300) };
    log.push(`[D-92 billing UI] error: ${String(e).slice(0, 200)}`);
  }

  // ---- Book overview + editor (writing surface) with content ----
  if (bookId) {
    try {
      await page.goto(BASE + `/books/${bookId}`, { waitUntil: "domcontentloaded" });
      await settle(page, 2200);
      await page.screenshot({ path: join(SHOTS, "book-overview_390x844.png"), fullPage: false });
      log.push("[editor] book overview captured");
    } catch (e) { log.push(`[editor overview] error: ${String(e).slice(0, 200)}`); }
  }
  if (bookId && chapterId) {
    try {
      await page.goto(BASE + `/books/${bookId}/chapters/${chapterId}`, { waitUntil: "domcontentloaded" });
      await settle(page, 3000);
      await page.screenshot({ path: join(SHOTS, "editor-chapter_390x844.png"), fullPage: false });
      const ed = await page.evaluate(() => {
        const txt = document.body.innerText;
        return {
          hasChapterOne: /Chapter One|Chapter 1/i.test(txt),
          hasSamProse: /Sam opened the notebook/i.test(txt),
          wordCountVisible: (txt.match(/\b(\d+)\s+words?\b/i) || [])[0] || null,
        };
      });
      capture.editor = ed;
      log.push(`[editor] chapter editor: samProse=${ed.hasSamProse} wordCount=${ed.wordCountVisible}`);

      // ---- LIVE ghost-text fetch from inside the page (persona headers on context) ----
      const gt = await page.evaluate(async ({ base, bid }) => {
        const res = await fetch(base + `/api/books/${bid}/ghost-text`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ context: "Sam opened the notebook and began to write. The words came", chapterNumber: 1 }),
        });
        let json = null; try { json = await res.json(); } catch {}
        return { status: res.status, json };
      }, { base: BASE, bid: bookId });
      capture.liveGhostTextFromEditor = gt;
      log.push(`[editor] LIVE ghost-text fetch -> ${gt.status} ${JSON.stringify(gt.json)}`);
    } catch (e) {
      capture.editor = { error: String(e).slice(0, 300) };
      log.push(`[editor chapter] error: ${String(e).slice(0, 200)}`);
    }
  }

  writeFileSync(join(TRACES, "ui-capture-v2.json"), JSON.stringify(capture, null, 2));
  writeFileSync(join(TRACES, "ui-capture-v2-log.txt"), log.join("\n"));
  console.log(log.join("\n"));
  await browser.close();
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
