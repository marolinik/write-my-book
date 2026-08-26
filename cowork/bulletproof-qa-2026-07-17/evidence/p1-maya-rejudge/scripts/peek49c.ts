/**
 * Peek for 49c — what does P1's reports page actually offer? Which tabs exist, which
 * recharts surfaces are mounted, and where is the plot area on screen? Read-only.
 *
 * Usage: npx tsx --env-file=.env peek49c.ts <bookId>
 */
import { chromium } from "playwright";
import { BASE, HIDE } from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET;
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const BOOK = process.argv[2];
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };
const INIT = `(function(){ var s=document.createElement("style"); s.textContent="nextjs-portal{display:none !important}"; document.addEventListener("DOMContentLoaded",function(){document.head.appendChild(s);}); })();`;

const PROBE = `(function(){
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]')).map(function(t){
    return { text: (t.textContent||"").trim(), selected: t.getAttribute("aria-selected"), value: t.getAttribute("data-value") || null };
  });
  var wraps = Array.prototype.slice.call(document.querySelectorAll(".recharts-wrapper")).map(function(w,i){
    var r = w.getBoundingClientRect();
    var bars = w.querySelectorAll(".recharts-bar-rectangle path").length;
    var dots = w.querySelectorAll(".recharts-dot, .recharts-line-dot").length;
    var sectors = w.querySelectorAll(".recharts-pie-sector, .recharts-sector").length;
    return { i: i, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bars: bars, dots: dots, sectors: sectors };
  });
  return { tabs: tabs, wraps: wraps, bodyHead: (document.body.innerText||"").slice(0, 900) };
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1, extraHTTPHeaders: H });
  await ctx.addInitScript({ content: INIT });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/books/${BOOK}/reports`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(6000);
  console.log("--- initial ---");
  console.log(JSON.stringify(await page.evaluate(PROBE), null, 2));

  // try to reach an analytics tab
  for (const label of ["Analytics", "Analysis"]) {
    const t = page.getByRole("tab", { name: new RegExp(label, "i") });
    if (await t.count()) {
      await t.first().click();
      await page.waitForTimeout(5000);
      console.log(`--- after clicking ${label} ---`);
      console.log(JSON.stringify(await page.evaluate(PROBE), null, 2));
      break;
    }
  }
  await page.screenshot({ path: "/tmp/peek49c.png", fullPage: false });
  await browser.close();
})();
