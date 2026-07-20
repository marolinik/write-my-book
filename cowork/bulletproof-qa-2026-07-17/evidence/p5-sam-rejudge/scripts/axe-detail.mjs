// Focused axe re-run capturing full node targets for the residual/new violations.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const SECRET = process.env.E2E_TEST_SECRET;
const OUT = process.argv[2] || ".";
mkdirSync(OUT, { recursive: true });

const screens = [
  { key: "books-list", url: "/books" },
  { key: "dashboard", url: "/dashboard" },
  { key: "settings", url: "/settings" },
  { key: "books-new-form", url: "/books/new" },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p5" },
  });
  const page = await ctx.newPage();
  const out = {};
  for (const s of screens) {
    await page.goto(BASE + s.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze();
    out[s.key] = r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        failureSummary: n.failureSummary,
        html: (n.html || "").slice(0, 220),
      })),
    }));
  }
  writeFileSync(join(OUT, "axe-results-detail.json"), JSON.stringify(out, null, 2));
  console.log("wrote axe-results-detail.json");
  for (const k of Object.keys(out)) {
    for (const v of out[k]) console.log(`${k}: ${v.id} (${v.impact}) -> ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
