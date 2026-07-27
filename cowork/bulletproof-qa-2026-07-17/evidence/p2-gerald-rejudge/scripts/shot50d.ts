/**
 * 50d — D-189 whole-word find & replace, ON CAMERA as P2 Gerald.
 *
 * Preview-only: no replacement is ever executed, so the fixture manuscript
 * (book 90436e20, the Zürich/Łódź/Kőszeg permutation text) is not modified.
 *
 * Four assertions, all read off the writer's own dialog:
 *   A. the toggle defaults ON;
 *   B. a word-like query counts FEWER matches with whole-word ON than OFF
 *      (proves the boundary rule actually runs);
 *   C. Unicode: `Zürich` still matches with whole-word ON, while the mid-word
 *      fragment `ürich` matches ONLY with it OFF (an ASCII \w rule would treat
 *      `ü` as a boundary and match the fragment);
 *   D. a non-word query disables the toggle and states the reason in prose.
 *
 * HARNESS NOTE: in-page snippets are raw SOURCE STRINGS (esbuild keepNames).
 *
 * Usage: npx tsx --env-file=.env shot50d.ts
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const BOOK = "90436e20-ffc7-42ca-a39f-dc7d48cdda10";
const CH = "7fe52a21-9838-4493-b990-19899e702786"; // Ch.1 "A Debt in Zürich"
const OUT = "../shots";
const HIDE = "nextjs-portal{display:none !important}";

const DIALOG = `(function(){
  var dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return { open: false };
  var t = dlg.innerText || "";
  var sw = dlg.querySelector('#fr-whole-word');
  var reason = /Whole word needs a search term/.test(t);
  var m = t.match(/(\\d+)\\s+match(?:es)?\\s+in\\s+(\\d+)\\s+chapters?/);
  return {
    open: true,
    wholeWordChecked: sw ? (sw.getAttribute("data-state") === "checked" || sw.getAttribute("aria-checked") === "true") : null,
    wholeWordDisabled: sw ? (sw.hasAttribute("disabled") || sw.getAttribute("data-disabled") !== null || sw.getAttribute("aria-disabled") === "true") : null,
    reasonShown: reason,
    reasonText: reason ? (t.match(/Whole word needs a search term[^\\n]*/) || [])[0] : null,
    matches: m ? Number(m[1]) : (/No matches found/.test(t) ? 0 : null),
    chapters: m ? Number(m[2]) : null,
    scopeBook: !!dlg.querySelector('[role="radio"][aria-checked="true"]') ? (dlg.querySelector('[role="radio"][aria-checked="true"]').innerText || "").trim() : null,
    previewHeader: (t.match(/(Searching…|No matches found\.|Search failed\.|\d+ match(?:es)? in \d+ chapters?|Type at least 2 characters to preview matches\.)/) || [])[0] || null,
    marks: Array.prototype.slice.call(dlg.querySelectorAll("mark")).slice(0, 6).map(function (x) { return (x.innerText || "").trim(); })
  };
})()`;

function log(m: string) { console.log(`[50d] ${m}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: `(function(){var s=document.createElement("style");s.textContent="nextjs-portal{display:none !important}";document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);});})();` });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));

  await page.goto(`${BASE}/books/${BOOK}/chapters/${CH}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(10000);

  await page.keyboard.press("Control+Shift+F");
  await page.waitForTimeout(2500);
  const opened: any = await page.evaluate(DIALOG);
  log(`dialog open=${opened.open} wholeWordChecked=${opened.wholeWordChecked}`);
  await page.screenshot({ path: `${OUT}/50d1-dialog-default-toggle-on.png`, fullPage: false });
  if (!opened.open) {
    writeFileSync(`${OUT}/50d-assertions.json`, JSON.stringify({ verdict: "UNREACHABLE", reason: "Ctrl+Shift+F did not open Find & Replace", opened, pageErrors }, null, 2));
    await browser.close();
    return;
  }

  // Whole-book scope for a bigger sample.
  const bookScope = page.getByRole("radio", { name: /Whole book/i });
  if (await bookScope.count()) { await bookScope.first().click(); await page.waitForTimeout(1200); }

  const find = page.locator("#fr-find");
  const toggle = page.locator("#fr-whole-word");

  /** Wait for the preview header to reach a terminal state (count, zero, or error). */
  async function settle(maxMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const s: any = await page.evaluate(DIALOG);
      if (s.matches !== null || (s.previewHeader && /failed|Type at least/.test(s.previewHeader))) return s;
      await page.waitForTimeout(1000);
    }
    return await page.evaluate(DIALOG);
  }

  async function query(text: string, wantWholeWord: boolean, tag: string, shot?: string) {
    await find.fill("");
    await page.waitForTimeout(600);
    await find.fill(text);
    await settle();
    const st: any = await page.evaluate(DIALOG);
    if (st.wholeWordChecked !== null && st.wholeWordChecked !== wantWholeWord && st.wholeWordDisabled === false) {
      await toggle.click();
      await settle();
    }
    const out: any = await page.evaluate(DIALOG);
    if (shot) await page.screenshot({ path: `${OUT}/${shot}`, fullPage: false });
    log(`${tag} q="${text}" wholeWord=${out.wholeWordChecked} matches=${out.matches} chapters=${out.chapters}`);
    return out;
  }

  // B — boundary rule really runs
  const oldOn = await query("old", true, "B-on", "50d2-old-wholeword-on.png");
  const oldOff = await query("old", false, "B-off", "50d3-old-wholeword-off.png");

  // C — Unicode word characters
  const zurichOn = await query("Zürich", true, "C-zurich-on");
  const fragOn = await query("ürich", true, "C-frag-on", "50d4-unicode-fragment-wholeword-on.png");
  const fragOff = await query("ürich", false, "C-frag-off", "50d5-unicode-fragment-wholeword-off.png");

  // D — non-word query disables the toggle and says why
  await find.fill("");
  await page.waitForTimeout(600);
  await find.fill("— ");
  await settle();
  const dash: any = await page.evaluate(DIALOG);
  await page.screenshot({ path: `${OUT}/50d6-nonword-toggle-disabled.png`, fullPage: false });
  log(`D q="— " disabled=${dash.wholeWordDisabled} reasonShown=${dash.reasonShown} matches=${dash.matches}`);
  const reasonEl = page.locator("p", { hasText: /Whole word needs a search term/ });
  if (await reasonEl.count()) {
    await reasonEl.first().screenshot({ path: `${OUT}/50d7-disabled-reason-closeup.png` }).catch((e) => log(`closeup failed: ${e.message}`));
  }

  writeFileSync(`${OUT}/50d-assertions.json`, JSON.stringify({
    shot: "50d", defect: "D-189", persona: "user_qa_p2", book: BOOK, chapter: CH,
    capturedAt: new Date().toISOString(),
    A_defaultOn: opened.wholeWordChecked === true,
    B: { on: oldOn.matches, off: oldOff.matches, onFewer: oldOn.matches !== null && oldOff.matches !== null && oldOn.matches < oldOff.matches },
    C: {
      zurichWholeWordMatches: zurichOn.matches,
      fragmentWholeWordOn: fragOn.matches,
      fragmentWholeWordOff: fragOff.matches,
      unicodeAware: zurichOn.matches !== null && zurichOn.matches > 0 && fragOn.matches === 0 && (fragOff.matches ?? 0) > 0,
    },
    D: { toggleDisabled: dash.wholeWordDisabled, reasonShown: dash.reasonShown, reasonText: dash.reasonText, matches: dash.matches },
    raw: { opened, oldOn, oldOff, zurichOn, fragOn, fragOff, dash },
    pageErrors,
  }, null, 2));
  await browser.close();
})();
