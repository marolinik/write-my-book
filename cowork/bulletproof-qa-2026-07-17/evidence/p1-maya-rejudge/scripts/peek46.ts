/** Free probe: what does P1's Editorial Review actually render, and where is finding 5c20c0e1? */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET!;
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: H });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(12000);
  const info = await page.evaluate(() => ({
    cardIds: Array.from(document.querySelectorAll('[id^="finding-card-"]')).map((e) => e.id),
    body: (document.body as HTMLElement).innerText.slice(0, 3000),
    buttons: Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.replace(/\n/g, "|")).filter(Boolean).slice(0, 60),
  }));
  console.log("CARDS:", JSON.stringify(info.cardIds, null, 1));
  console.log("BUTTONS:", JSON.stringify(info.buttons));
  console.log("BODY:\n" + info.body);
  await page.screenshot({ path: process.argv[2] + "/peek46-editorial.png", fullPage: true });
  await browser.close();
})();
