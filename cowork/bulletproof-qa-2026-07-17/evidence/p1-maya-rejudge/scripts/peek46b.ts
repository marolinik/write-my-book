/** Free probe: does the 46-series init script actually install? Report page errors verbatim. */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET!;
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" };
const RAW_SYNTAX_SRC = "<{2,}|>{2,}|\\bREMEMBER\\b|\\bREVISION\\b";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, extraHTTPHeaders: H });
  await ctx.addInitScript((rawSrc: string) => {
    Object.defineProperty(window, "__name", { value: (f: unknown) => f, writable: true, configurable: true });
    type Rec = Record<string, unknown>;
    const W = window as unknown as { __d: { turns: Rec[] }; __dom: { samples: Rec[]; violations: Rec[]; armed: boolean }; __initErr?: string; fetch: typeof fetch };
    try {
      W.__d = { turns: [] };
      W.__dom = { samples: [], violations: [], armed: false };
      const RAW = new RegExp(rawSrc);
      setInterval(() => {
        const bubble = document.querySelector('[data-testid="discuss-live-bubble"]') as HTMLElement | null;
        const text = bubble ? bubble.innerText : null;
        const arr = W.__dom.samples;
        const prev = arr.length ? (arr[arr.length - 1].text as string | null) : undefined;
        if (text !== prev) arr.push({ tMs: performance.now(), text, len: text ? text.length : 0 });
        if (bubble && bubble.parentElement && RAW.test(bubble.parentElement.innerText || "")) {
          W.__dom.violations.push({ tMs: performance.now(), snippet: (bubble.parentElement.innerText || "").slice(0, 300) });
        }
      }, 25);
    } catch (e) {
      W.__initErr = String((e as Error) && (e as Error).stack);
    }
  }, RAW_SYNTAX_SRC);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 300)); });
  await page.goto(`${BASE}/api/health`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const probe = await page.evaluate(() => {
    const w = window as unknown as { __dom?: unknown; __d?: unknown; __initErr?: string; __name?: unknown };
    return { hasDom: typeof w.__dom, hasD: typeof w.__d, initErr: w.__initErr ?? null, nameShim: typeof w.__name };
  });
  console.log("PROBE:", JSON.stringify(probe));
  await browser.close();
})();
