/**
 * Shot 45i — D-175 in pixels: "Usage by Model" folds the aliasing slots into ONE
 * Qwen 3.6 27B row and discloses the fold.
 *
 * 45f1 showed two rows reading `Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)`
 * with different numbers and no discriminator. Asserts, on camera:
 *   - `/api/usage` byModel STILL carries >1 aliasing registry id (the raw data
 *     did not change — only the rendering did)
 *   - exactly ONE rendered row whose label is the Qwen 3.6 27B label
 *   - that row carries "Combined across N configured slots: <ids>"
 *   - the folded money equals the sum of the contributing raw rows (no recompute)
 *
 * Usage: npx tsx --env-file=.env shot45i.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const CLERK = "user_qa_p6";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }
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
    Object.defineProperty(window, "__name", { value: (f: unknown) => f, writable: true, configurable: true });
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });

  const usageJson = await (await ctx.request.get(`${BASE}/api/usage`)).json();

  const page = await ctx.newPage();
  // ENV-01 warm, then capture.
  const tWarm = Date.now();
  await page.goto(`${BASE}/settings/billing`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const warmMs = Date.now() - tWarm;
  await page.waitForTimeout(9000);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.getByText("Usage by Model").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);

  // Read the RENDERED rows out of the Usage by Model card.
  const rendered = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-slot="card"]')) as HTMLElement[];
    const card = cards.filter((c) => /^\s*Usage by Model/.test(c.innerText || ""))[0];
    if (!card) return { found: false, rows: [] as Array<Record<string, string>> };
    const rows = (Array.from(card.querySelectorAll("div.rounded-md.border")) as HTMLElement[]).map((r) => {
      const ps = Array.from(r.querySelectorAll("p")) as HTMLElement[];
      return {
        text: r.innerText.replace(/\n+/g, " | "),
        label: ps[0] ? ps[0].innerText : "",
        lines: ps.map((p) => p.innerText),
      };
    });
    return { found: true, cardText: card.innerText, rows };
  });

  interface RenderedRow { text: string; label: string; lines: string[] }
  const rows = (rendered.rows ?? []) as unknown as RenderedRow[];
  const qwenRows = rows.filter((r) => /Qwen 3\.6 27B/i.test(r.label ?? ""));
  const disclosure = qwenRows.map((r) => r.lines.filter((l) => /Combined across/.test(l))[0] ?? null);

  // Raw byModel — the aliasing must still be present in the data.
  const byModel = (usageJson.byModel ?? {}) as Record<string, { costEstimate?: number; tokensInput?: number; tokensOutput?: number; modelId?: string }>;
  const qwenSlots = Object.keys(byModel).filter((k) => /qwen36/i.test(k));
  const rawQwenCost = qwenSlots.reduce((a, k) => a + (byModel[k]?.costEstimate ?? 0), 0);
  const renderedQwenCost = qwenRows
    .map((r) => Number((r.lines.filter((l) => /^\$/.test(l))[0] ?? "$0").replace("$", "")))
    .reduce((a, b) => a + b, 0);

  const report = {
    shot: "45i",
    supersedes: "45f1 (defect frame)",
    proves: "D-175 — one folded Qwen row with the slot disclosure",
    warmMs,
    rawByModelKeys: Object.keys(byModel),
    qwenAliasingSlots: qwenSlots,
    rawQwenCostSum: Number(rawQwenCost.toFixed(6)),
    renderedRows: rows.map((r) => r.text),
    qwenRowCount: qwenRows.length,
    qwenDisclosureLine: disclosure,
    renderedQwenCostShown: renderedQwenCost,
    verdict: {
      dataStillAliases: qwenSlots.length > 1,
      exactlyOneQwenRow: qwenRows.length === 1,
      disclosureRendered: !!disclosure[0] && /Combined across \d+ configured slots:/.test(disclosure[0]),
      disclosureNamesSlots: !!disclosure[0] && qwenSlots.every((s) => (disclosure[0] as string).includes(s)),
      moneyPreserved: Math.abs(renderedQwenCost - rawQwenCost) < 0.011, // panel rounds to cents
    },
    usageApiByModel: byModel,
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/45i-assertions.json`, JSON.stringify(report, null, 2));

  await page.getByText("Usage by Model").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/45i-usage-by-model-folded.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/45i-usage-by-model-folded-full.png`, fullPage: true });

  console.log(JSON.stringify({ verdict: report.verdict, qwenAliasingSlots: qwenSlots, qwenDisclosureLine: disclosure, rawQwenCostSum: report.rawQwenCostSum, renderedQwenCostShown: renderedQwenCost }, null, 2));
  console.log("--- rendered rows ---\n" + report.renderedRows.join("\n"));
  await browser.close();
})();
