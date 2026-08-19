/**
 * Shot 43a — D-157 live re-shoot.
 * ONE live discuss turn as persona user_qa_p1 on a pending finding, driven through the
 * real UI (chromium). Asserts the assistant bubble carries ZERO raw control syntax and
 * that the "I'll remember" constraint chip renders.
 *
 * Usage: npx tsx --env-file=.env shot43a.ts <findingId> <outDir> "<writer message>"
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const findingId = process.argv[2];
const outDir = process.argv[3];
const writerMessage = process.argv[4];
if (!findingId || !outDir || !writerMessage) { console.error("usage: <findingId> <outDir> <message>"); process.exit(1); }

const HIDE_DEVTOOLS = `nextjs-portal{display:none !important}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" },
  });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("response", async (r) => {
    if (r.url().includes("/discuss") || r.url().includes(`/findings/${findingId}`)) {
      net.push({ url: r.url(), method: r.request().method(), status: r.status(), at: new Date().toISOString() });
    }
  });

  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.addStyleTag({ content: HIDE_DEVTOOLS }).catch(() => {});
  const card = page.locator(`#finding-card-${findingId}`);
  await card.waitFor({ state: "visible", timeout: 90000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  // Open the thread
  await card.getByRole("button", { name: "Discuss" }).click();
  await card.getByPlaceholder("Explain your intent or why you disagree…").waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/43-pre-turn.png`, fullPage: false });

  // Send the writer turn
  const t0 = Date.now();
  const input = card.getByPlaceholder("Explain your intent or why you disagree…");
  await input.fill(writerMessage);
  await page.waitForTimeout(200);
  await input.press("Enter");

  // Wait for the assistant bubble (a mr-6 bubble that is not the seeded opening <p>)
  await page.waitForFunction(
    (id) => {
      const el = document.getElementById(`finding-card-${id}`);
      if (!el) return false;
      return el.querySelectorAll("div.mr-6").length >= 1;
    },
    findingId,
    { timeout: 240000 }
  );
  const elapsedMs = Date.now() - t0;
  await page.waitForTimeout(2500); // let the chip / revision card settle

  const bubbles = await page.evaluate((id) => {
    const el = document.getElementById(`finding-card-${id}`);
    if (!el) return null;
    const assistant = Array.from(el.querySelectorAll("div.mr-6")).map((n) => (n as HTMLElement).innerText);
    const user = Array.from(el.querySelectorAll("div.ml-6")).map((n) => (n as HTMLElement).innerText);
    const chip = Array.from(el.querySelectorAll("p")).map((n) => (n as HTMLElement).innerText)
      .filter((t) => t.includes("I’ll remember") || t.includes("I'll remember"));
    return { assistant, user, chip, cardText: (el as HTMLElement).innerText };
  }, findingId);

  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await card.screenshot({ path: `${outDir}/43a-discuss-clean-chip.png` });
  await page.screenshot({ path: `${outDir}/43a-discuss-clean-chip-full.png`, fullPage: true });

  const RAW = /<{2,4}\s*(REMEMBER|REVISION|END)\b/;
  const leaked = (bubbles?.assistant ?? []).filter((t) => RAW.test(t));
  const report = {
    findingId, writerMessage, elapsedMs,
    assistantBubbles: bubbles?.assistant ?? [],
    userBubbles: bubbles?.user ?? [],
    constraintChip: bubbles?.chip ?? [],
    rawSyntaxLeakedInBubbles: leaked,
    verdict: {
      zeroRawSyntax: leaked.length === 0,
      chipRendered: (bubbles?.chip ?? []).length > 0,
    },
    network: net,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/43a-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ elapsedMs, verdict: report.verdict, chip: report.constraintChip, leaked }, null, 2));
  console.log("--- assistant bubbles ---");
  for (const b of report.assistantBubbles) console.log(JSON.stringify(b));

  await browser.close();
})();
