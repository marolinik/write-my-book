/**
 * Shot 43 render/dismiss driver — D-157 live re-shoot (2026-07-27).
 *
 * Render-only by default: opens the editorial surface as persona user_qa_p1, expands the
 * Discuss thread on one finding, asserts the assistant bubble carries ZERO raw control
 * syntax (`<<<REMEMBER…`, `<<<END>>>`, `<<<REVISION>>>`) and that the "I'll remember"
 * constraint chip renders, then screenshots the card. No LLM spend.
 *
 * With --dismiss it also clicks the in-thread "Keep as-is" button (PATCH /findings →
 * re-parses the stored raw turn and persists the constraint to WriterMemory).
 *
 * Usage:
 *   npx tsx --env-file=.env shot43-render.ts <findingId> <outDir> <shotBaseName> [--dismiss]
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "4116055c-6183-4675-926a-e04f31126951";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }

const findingId = process.argv[2];
const outDir = process.argv[3];
const shotName = process.argv[4];
const doDismiss = process.argv.includes("--dismiss");
if (!findingId || !outDir || !shotName) { console.error("usage: <findingId> <outDir> <shotBaseName> [--dismiss]"); process.exit(1); }

const HIDE_DEVTOOLS = "nextjs-portal{display:none !important}";
const RAW = /<{2,4}\s*[A-Z][A-Z0-9_]*\b|<{2,4}\s*END\s*>{1,4}/;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p1" },
  });
  const page = await ctx.newPage();
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    if (r.url().includes("/editorial/findings")) {
      net.push({ method: r.request().method(), url: r.url().replace(BASE, ""), status: r.status(), at: new Date().toISOString() });
    }
  });

  await page.goto(`${BASE}/books/${BOOK}/editorial`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE_DEVTOOLS }).catch(() => {});
  const card = page.locator(`#finding-card-${findingId}`);
  await card.waitFor({ state: "visible", timeout: 120000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  await card.getByRole("button", { name: "Discuss" }).click();
  // wait until at least one assistant bubble has rendered inside this card
  await page.waitForFunction(
    (id) => {
      const el = document.getElementById(`finding-card-${id}`);
      return !!el && el.querySelectorAll("p.mr-6").length >= 1;
    },
    findingId,
    { timeout: 60000 }
  );
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE_DEVTOOLS }).catch(() => {});

  const read = async () => page.evaluate(`(() => {
    const el = document.getElementById("finding-card-${findingId}");
    if (!el) return null;
    const all = [].slice.call(el.querySelectorAll("p")).map(function (n) { return n.innerText; });
    return {
      assistant: [].slice.call(el.querySelectorAll("p.mr-6")).map(function (n) { return n.innerText; }),
      user: [].slice.call(el.querySelectorAll("p.ml-6")).map(function (n) { return n.innerText; }),
      chip: all.filter(function (t) { return t.indexOf("ll remember:") !== -1; }),
      cardText: el.innerText,
    };
  })()`) as Promise<{ assistant: string[]; user: string[]; chip: string[]; cardText: string } | null>;

  const before = await read();
  const leaked = (before?.assistant ?? []).filter((t) => RAW.test(t));

  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await card.screenshot({ path: `${outDir}/${shotName}.png` });
  await page.screenshot({ path: `${outDir}/${shotName}-full.png`, fullPage: true });

  let afterDismiss: unknown = null;
  if (doDismiss) {
    await card.getByRole("button", { name: "Keep as-is" }).first().click();
    await page.waitForFunction(
      (id) => {
        const el = document.getElementById(`finding-card-${id}`);
        return !!el && /dismissed/i.test((el as HTMLElement).innerText);
      },
      findingId,
      { timeout: 60000 }
    ).catch(() => {});
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: HIDE_DEVTOOLS }).catch(() => {});
    afterDismiss = await read();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await card.screenshot({ path: `${outDir}/${shotName}-dismissed.png` });
  }

  const report = {
    findingId, shotName, dismissed: doDismiss,
    assistantBubbles: before?.assistant ?? [],
    userBubbles: before?.user ?? [],
    constraintChip: before?.chip ?? [],
    rawSyntaxLeakedInBubbles: leaked,
    verdict: { zeroRawSyntax: leaked.length === 0, chipRendered: (before?.chip ?? []).length > 0 },
    afterDismiss,
    network: net,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/${shotName}-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, chip: report.constraintChip, leaked }, null, 2));
  console.log("--- assistant bubbles ---");
  for (const b of report.assistantBubbles) console.log(JSON.stringify(b));
  await browser.close();
})();
