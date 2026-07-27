/** Peek — why did the 47e revoke click not reach the DELETE route? */
import { chromium } from "playwright";
import { BASE, HIDE } from "./shot47-lib";

const SECRET = process.env.E2E_TEST_SECRET as string;
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };
const ID = process.argv[2];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: H });
  const page = await ctx.newPage();
  const console_: string[] = [];
  page.on("console", (m) => console_.push(`${m.type()}: ${m.text().slice(0, 220)}`));
  page.on("pageerror", (e) => console_.push(`pageerror: ${e.message.slice(0, 300)}`));
  const net: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/memory")) net.push(`REQ ${r.method()} ${r.url().replace(BASE, "")}`); });
  page.on("response", (r) => { if (r.url().includes("/api/memory")) net.push(`RES ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`); });

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(7000);

  const info = await page.evaluate(`(function(){
    var bs = Array.prototype.slice.call(document.querySelectorAll('[aria-label^="Forget memory:"]'));
    return bs.map(function (b) {
      var r = b.getBoundingClientRect();
      var cs = getComputedStyle(b);
      var pcs = b.parentElement ? getComputedStyle(b.parentElement) : null;
      var top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        label: (b.getAttribute("aria-label") || "").slice(0, 40),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        opacity: cs.opacity, pointerEvents: cs.pointerEvents, parentOpacity: pcs ? pcs.opacity : null,
        elementFromPointTag: top ? top.tagName + "." + String(top.className).slice(0, 40) : null,
        isSelfAtPoint: top === b || (top && b.contains(top))
      };
    });
  })()`);
  console.log("BUTTONS:", JSON.stringify(info, null, 1));

  const target = page.locator(`[aria-label^="Forget memory:"]`).nth(1);
  await target.scrollIntoViewIfNeeded();
  await target.hover().catch((e) => console_.push("hover-fail: " + e.message.slice(0, 120)));
  await page.waitForTimeout(600);
  await target.click({ timeout: 15000 }).catch((e) => console_.push("click-fail: " + e.message.slice(0, 200)));
  await page.waitForTimeout(3000);
  console.log("NET after playwright click:", JSON.stringify(net));

  if (net.length === 0) {
    // Is React even listening? Dispatch a trusted-ish click through the DOM.
    await page.evaluate(`(function(){
      var bs = Array.prototype.slice.call(document.querySelectorAll('[aria-label^="Forget memory:"]'));
      if (bs[1]) bs[1].click();
      return true;
    })()`);
    await page.waitForTimeout(3000);
    console.log("NET after dom .click():", JSON.stringify(net));
  }
  console.log("CONSOLE:", JSON.stringify(console_.slice(-25), null, 1));
  await browser.close();
})();
