/**
 * Shot 45d — ONE live discuss turn on a pending finding (D-172 billing proof +
 * the blocking-POST latency judge B floored P6's D5 on).
 *
 * Drives the real editorial UI as user_qa_p6: open the finding card, Discuss,
 * send one writer turn, wait for the assistant bubble. Records the wall-clock
 * of the blocking POST and every network status, then leaves the DB read to the
 * capture doc (usage_records must now carry a row for this turn — pre-e75996e
 * it carried none).
 *
 * Usage: npx tsx --env-file=.env shot45d.ts <outDir> <bookId> <findingId> "<message>"
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p6";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const [outDir, BOOK, FINDING, MESSAGE] = process.argv.slice(2);
if (!outDir || !BOOK || !FINDING || !MESSAGE) { console.error("usage: <outDir> <bookId> <findingId> <message>"); process.exit(1); }
const HIDE = "nextjs-portal{display:none !important}";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: H,
  });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const api = ctx.request;
  const warmT = Date.now();
  await api.get(BASE + "/books/" + BOOK + "/editorial");
  const warmMs = Date.now() - warmT;

  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("request", (r) => {
    if (r.url().indexOf("/discuss") >= 0) net.push({ phase: "request", t: Date.now(), method: r.method() });
  });
  page.on("response", (r) => {
    if (r.url().indexOf("/discuss") >= 0) net.push({ phase: "response", t: Date.now(), status: r.status() });
  });

  await page.goto(BASE + "/books/" + BOOK + "/editorial", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  const card = page.locator("#finding-card-" + FINDING);
  await card.waitFor({ state: "visible", timeout: 120000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outDir + "/45d1-finding-pre-discuss.png", fullPage: false });

  await card.getByRole("button", { name: "Discuss" }).click();
  const input = card.getByPlaceholder(/Explain your intent/);
  await input.waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);

  const t0 = Date.now();
  await input.fill(MESSAGE);
  await input.press("Enter");

  // Perceived wait: sample every 500ms until an assistant bubble exists.
  const samples: Array<{ t: number; bubbles: number; spinner: boolean }> = [];
  let firstBubbleMs: number | null = null;
  while (Date.now() - t0 < 300000) {
    const snap = await page.evaluate((id) => {
      const el = document.getElementById("finding-card-" + id);
      if (!el) return { bubbles: 0, spinner: false };
      return {
        bubbles: el.querySelectorAll("div.mr-6").length,
        spinner: el.querySelectorAll(".animate-spin").length > 0,
      };
    }, FINDING);
    samples.push({ t: Date.now() - t0, bubbles: snap.bubbles, spinner: snap.spinner });
    if (snap.bubbles >= 1) { firstBubbleMs = Date.now() - t0; break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);

  const thread = await page.evaluate((id) => {
    const el = document.getElementById("finding-card-" + id);
    if (!el) return null;
    return {
      assistant: Array.from(el.querySelectorAll("div.mr-6")).map((n) => (n as HTMLElement).innerText),
      user: Array.from(el.querySelectorAll("div.ml-6")).map((n) => (n as HTMLElement).innerText),
      cardText: (el as HTMLElement).innerText,
    };
  }, FINDING);

  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await card.screenshot({ path: outDir + "/45d2-discuss-turn.png" });
  await page.screenshot({ path: outDir + "/45d2-discuss-turn-full.png", fullPage: true });

  const req = net.find((n) => n.phase === "request");
  const res = net.find((n) => n.phase === "response");
  const report = {
    shot: "45d",
    book: BOOK,
    findingId: FINDING,
    writerMessage: MESSAGE,
    warmMs,
    timings: {
      submitToFirstBubbleMs: firstBubbleMs,
      blockingPostMs: req && res ? (res.t as number) - (req.t as number) : null,
      spinnerVisibleThroughout: samples.length > 1 ? samples.slice(0, -1).every((s) => s.spinner) : null,
    },
    perceivedSamples: samples,
    thread,
    network: net.map((n) => ({ phase: n.phase, status: n.status ?? null, tMs: (n.t as number) - t0 })),
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(outDir + "/45d-assertions.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ timings: report.timings, network: report.network, assistantBubbles: thread ? thread.assistant.length : 0 }, null, 2));
  if (thread) for (const b of thread.assistant) console.log("ASSISTANT: " + JSON.stringify(b.slice(0, 400)));
  await browser.close();
})();
