// P5 Sam re-judge — Playwright + axe-core harness at 390x844 (phone-first).
// Persona identity is applied at the network layer via extraHTTPHeaders, the
// same pattern playwright.config.ts uses. Secret read from process.env, never
// printed. Run:  node --env-file=.env ui-harness.mjs <outRoot> <bookId>
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK_ID = "user_qa_p5";
const OUT = process.argv[2] || ".";
const bookId = process.argv[3] || null;
const SHOTS = join(OUT, "screenshots");
const TRACES = join(OUT, "api-traces");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(TRACES, { recursive: true });

const VP = { width: 390, height: 844 };
const axeResults = {};
const localeResults = {};
const log = [];

async function settle(page, ms = 1500) {
  try { await page.waitForLoadState("domcontentloaded", { timeout: 20000 }); } catch {}
  await page.waitForTimeout(ms);
}

async function patchLanguage(page, code) {
  return await page.evaluate(async ({ code, base }) => {
    const res = await fetch(base + "/api/settings/language", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: code }),
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }, { code, base: BASE });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK_ID },
  });
  const page = await context.newPage();

  // ---- A11y + screenshots on 4 baseline screens (D-09 duplicate main, D-10 button-name) ----
  const screens = [
    { key: "books-list", url: "/books" },
    { key: "dashboard", url: "/dashboard" },
    { key: "settings", url: "/settings" },
    { key: "books-new-form", url: "/books/new" },
  ];

  for (const s of screens) {
    await page.goto(BASE + s.url, { waitUntil: "domcontentloaded" });
    await settle(page);
    // count main landmarks live (D-09) + capture unnamed-button count (D-10)
    const dom = await page.evaluate(() => {
      const mains = document.querySelectorAll("main");
      const btns = Array.from(document.querySelectorAll("button, a"));
      const nameless = btns.filter((b) => {
        const al = b.getAttribute("aria-label");
        const txt = (b.textContent || "").trim();
        const title = b.getAttribute("title");
        return !al && !txt && !title;
      });
      return {
        mainCount: mains.length,
        htmlDir: document.documentElement.getAttribute("dir"),
        htmlLang: document.documentElement.getAttribute("lang"),
        namelessButtonCount: nameless.length,
      };
    });
    let axe = null;
    try {
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "best-practice"])
        .analyze();
      axe = {
        violationCount: r.violations.length,
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          help: v.help,
        })),
      };
    } catch (e) {
      axe = { error: String(e).slice(0, 300) };
    }
    axeResults[s.key] = { url: s.url, dom, axe };
    await page.screenshot({ path: join(SHOTS, `${s.key}_390x844_light.png`), fullPage: false });
    log.push(`[axe] ${s.key}: main=${dom.mainCount} namelessBtns=${dom.namelessButtonCount} violations=${axe.violationCount ?? "ERR"}`);
  }

  // ---- Onboarding wizard (card-free "Skip for now" on-ramp UI) ----
  try {
    await page.goto(BASE + "/onboarding", { waitUntil: "domcontentloaded" });
    await settle(page, 2000);
    await page.screenshot({ path: join(SHOTS, "onboarding-wizard_390x844_light.png"), fullPage: true });
    const skipText = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const m = btns.find((b) => /skip for now|start writing free/i.test(b.textContent || ""));
      return m ? m.textContent.trim() : null;
    });
    log.push(`[onboarding] skip-button text: ${JSON.stringify(skipText)}`);
    axeResults["_onboardingSkipButton"] = skipText;
  } catch (e) {
    log.push(`[onboarding] error: ${String(e).slice(0, 200)}`);
  }

  // ---- Editor with the words Sam typed (card-free write proof) ----
  if (bookId) {
    try {
      await page.goto(BASE + `/books/${bookId}`, { waitUntil: "domcontentloaded" });
      await settle(page, 2500);
      await page.screenshot({ path: join(SHOTS, "editor-freetier-book_390x844_light.png"), fullPage: false });
      log.push("[editor] captured book overview for free-tier book");
    } catch (e) {
      log.push(`[editor] error: ${String(e).slice(0, 200)}`);
    }
  }

  // ---- i18n locale sweep: en / fr / ar (D-11 nav labels, D-12 Arabic) ----
  for (const code of ["en", "fr", "ar"]) {
    const patch = await patchLanguage(page, code);
    // reload a screen that shows the mobile bottom nav (books list)
    await page.goto(BASE + "/books", { waitUntil: "domcontentloaded" });
    await settle(page, 1800);
    const snap = await page.evaluate(() => {
      const nav = document.querySelector("nav.fixed.bottom-0, nav[class*='bottom-0']");
      let navLabels = [];
      if (nav) navLabels = Array.from(nav.querySelectorAll("span")).map((s) => s.textContent.trim()).filter(Boolean);
      // grab a few chrome strings to gauge translation
      const h1 = document.querySelector("h1");
      return {
        htmlDir: document.documentElement.getAttribute("dir"),
        htmlLang: document.documentElement.getAttribute("lang"),
        navLabels,
        firstHeading: h1 ? h1.textContent.trim() : null,
      };
    });
    localeResults[code] = { patch, render: snap };
    await page.screenshot({ path: join(SHOTS, `books-list_390x844_light_locale-${code}.png`), fullPage: false });
    // also settings for the picker + chrome
    await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
    await settle(page, 1500);
    await page.screenshot({ path: join(SHOTS, `settings_390x844_light_locale-${code}.png`), fullPage: false });
    log.push(`[locale ${code}] patch=${patch.status} dir=${snap.htmlDir} nav=${JSON.stringify(snap.navLabels)}`);
  }

  // reset back to en so Sam isn't left mid-sweep
  await patchLanguage(page, "en");

  // capture the settings language picker options (should be 7 UI langs, no Arabic)
  await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  const pickerOptions = await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll("select option, [role='option']"));
    return opts.map((o) => (o.textContent || "").trim()).filter(Boolean);
  });
  axeResults["_languagePickerOptions"] = pickerOptions;

  writeFileSync(join(TRACES, "axe-results.json"), JSON.stringify(axeResults, null, 2));
  writeFileSync(join(TRACES, "locale-sweep.json"), JSON.stringify(localeResults, null, 2));
  writeFileSync(join(TRACES, "ui-harness-log.txt"), log.join("\n"));
  console.log(log.join("\n"));
  console.log("\npicker options:", JSON.stringify(pickerOptions));

  await browser.close();
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
