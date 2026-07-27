/**
 * Shot 45h — D-174 in pixels: finishing the wizard flips the chrome WITHOUT a reload.
 *
 * The 45b4 defect frame was "the sidebar right after Start Writing! still reads
 * Getting Started 2/5 unchecked, Style [Next Step]" — the wizard PATCHed settings
 * with a raw fetch and never invalidated ["book-settings", bookId].
 *
 * This shot proves the flip inside ONE SPA session:
 *   1. PATCH /api/books/:id/settings {setupComplete:false}  (the documented D-35 lever)
 *   2. walk the wizard to Done in the browser
 *   3. capture the sidebar on the Done step  -> BEFORE (no check, Style [Next Step])
 *   4. click "Start Writing!"  -> lands in the Ch 1 editor (D-161)
 *   5. capture the sidebar there WITHOUT ANY RELOAD -> AFTER (check, no Style badge)
 *
 * "No reload" is proven two ways, not asserted:
 *   - a `window.__noReloadSentinel` stamped just before the CTA click; a document
 *     reload wipes it, so its survival at capture time means the JS context lived
 *   - a page-level `load`/`domcontentloaded` listener counter, reported verbatim
 *
 * Usage: npx tsx --env-file=.env shot45h.ts <outDir>
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "8632ba0c-f05b-4fd5-9581-3790a0f2c675";
const CLERK = "user_qa_p6";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const outDir = process.argv[2];
if (!outDir) { console.error("usage: <outDir>"); process.exit(1); }
const HIDE = "nextjs-portal{display:none !important}";
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": CLERK };

/**
 * Read the three D-174 tells straight out of the live DOM.
 *
 * Written as ONE expression with no named inner functions on purpose: tsx/esbuild
 * `keepNames` wraps named function expressions in `__name(...)`, which does not
 * exist inside the page context (the harness bug already disclosed in the
 * P1 43-series). A `__name` shim is installed via addInitScript as well.
 */
const CHROME_PROBE = () => {
  const sidebar = document.querySelector('[data-slot="sidebar"], [data-sidebar="sidebar"], aside') as HTMLElement | null;
  const links = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  const setupLink = links.filter((a) => /\/setup$/.test(a.getAttribute("href") || ""))[0];
  const styleLink = links.filter((a) => /\/style$/.test(a.getAttribute("href") || ""))[0];
  const chaptersBtn = (Array.from(document.querySelectorAll("button")) as HTMLElement[]).filter((b) =>
    /^\s*Chapters\s/.test(b.innerText || "")
  )[0];
  const gsLabel = (Array.from(document.querySelectorAll("div")) as HTMLElement[]).filter(
    (e) => /^Getting Started/.test(e.innerText || "") && (e.innerText || "").length < 40
  )[0];
  return {
    sidebarText: sidebar ? sidebar.innerText : null,
    setupItemChecked: !!setupLink && !!setupLink.querySelector('svg[class*="text-green"]'),
    setupItemNextStep: /Next Step/.test(setupLink ? setupLink.innerText : ""),
    styleItemNextStep: /Next Step/.test(styleLink ? styleLink.innerText : ""),
    chaptersItemNextStep: /Next Step/.test(chaptersBtn ? chaptersBtn.innerText : ""),
    gettingStartedGroupChecked: !!gsLabel && !!gsLabel.querySelector('svg[class*="text-green"]'),
    gettingStartedLabelText: gsLabel ? gsLabel.innerText : null,
    sentinel: (window as unknown as { __noReloadSentinel?: number }).__noReloadSentinel ?? null,
    url: location.pathname,
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: H,
  });
  await ctx.addInitScript(() => {
    // Harness shim: tsx/esbuild keepNames emits __name() wrappers into serialized
    // page functions. Identity shim so probe bodies survive. Not product code.
    Object.defineProperty(window, "__name", { value: (f: unknown) => f, writable: true, configurable: true });
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none !important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const api = ctx.request;
  const trace: Array<Record<string, unknown>> = [];

  const chBefore = await (await api.get(`${BASE}/api/books/${BOOK}/chapters`)).json();
  const ch1 = chBefore[0]?.id ?? "";

  // 1. The documented D-35 reset lever.
  const reset = await api.patch(`${BASE}/api/books/${BOOK}/settings`, {
    headers: { ...H, "Content-Type": "application/json" },
    data: { setupComplete: false },
  });
  trace.push({ step: "reset", status: reset.status(), body: await reset.json() });

  // 2. ENV-01 warm both routes server-side before anything on camera.
  for (const [k, u] of [["setup", `${BASE}/books/${BOOK}/setup`], ["editor", `${BASE}/books/${BOOK}/chapters/${ch1}`]] as const) {
    const t = Date.now();
    const r = await api.get(u);
    trace.push({ step: `warm-${k}`, status: r.status(), ms: Date.now() - t });
  }

  const page = await ctx.newPage();
  let hardLoads = 0;
  page.on("load", () => { hardLoads += 1; });
  const net: Array<Record<string, unknown>> = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/books/")) net.push({ url: u.replace(BASE, ""), method: r.request().method(), status: r.status(), at: Date.now() });
  });

  await page.goto(`${BASE}/books/${BOOK}/setup`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.getByText(/steps done/).waitFor({ timeout: 120000 });
  await page.waitForTimeout(5000);

  // 3. Walk to Done (Continue / Skip), same walk as 45b.
  const walk: string[] = [];
  for (let i = 0; i < 8; i++) {
    if (/Start Writing!/.test(await page.locator("body").innerText())) break;
    const fwd = page.getByRole("button", { name: /^(Continue|Skip)$/ });
    if ((await fwd.count()) === 0) break;
    const label = (await fwd.first().innerText()).trim();
    walk.push(label);
    await fwd.first().click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(2500);

  // 4. BEFORE frame — the Done step, chrome still pre-completion.
  const before = await page.evaluate(CHROME_PROBE);
  await page.screenshot({ path: `${outDir}/45h1-done-step-chrome-before.png`, fullPage: false });

  // 5. Stamp the no-reload sentinel, then click the CTA.
  await page.evaluate(() => {
    (window as unknown as { __noReloadSentinel?: number }).__noReloadSentinel = Date.now();
  });
  const loadsBefore = hardLoads;
  const startBtn = page.getByRole("button", { name: /Start Writing!/ });
  const t0 = Date.now();
  await startBtn.click();
  await page.waitForURL(/\/chapters\//, { timeout: 180000 });
  const tUrl = Date.now() - t0;
  // Let the invalidated ["book-settings"] query refetch and repaint. No reload.
  await page.waitForTimeout(6000);
  const tCapture = Date.now() - t0;

  const after = await page.evaluate(CHROME_PROBE);
  await page.screenshot({ path: `${outDir}/45h2-editor-chrome-after-noreload.png`, fullPage: false });
  await page.screenshot({ path: `${outDir}/45h2-editor-chrome-after-noreload-full.png`, fullPage: true });

  // 6. Bonus, still no document reload: SPA-nav back to Overview via the sidebar
  //    link and show the D-173 card + flipped chrome together.
  let overview: Record<string, unknown> | null = null;
  try {
    await page.getByRole("link", { name: /^Overview$/ }).first().click({ timeout: 15000 });
    await page.waitForURL(new RegExp(`/books/${BOOK}$`), { timeout: 60000 });
    await page.waitForTimeout(6000);
    overview = await page.evaluate(CHROME_PROBE);
    const body = await page.locator("body").innerText();
    overview.noCaptureStyleSolicitation = !/Capture (My )?Writing Style|Capture Style/i.test(body);
    overview.recommendation = (body.match(/Recommended[\s\S]{0,120}/) ?? [""])[0];
    await page.screenshot({ path: `${outDir}/45h3-overview-spa-nav-no-reload.png`, fullPage: false });
  } catch (e) {
    overview = { error: (e as Error).message };
  }

  const settingsAfter = await (await api.get(`${BASE}/api/books/${BOOK}/settings`)).json();

  const report = {
    shot: "45h",
    supersedes: "45b4 (defect frame)",
    proves: "D-174 — wizard completion reaches the chrome with no reload",
    walkClicks: walk,
    ctaMs: { urlChanged: tUrl, chromeCaptured: tCapture },
    documentLoads: { beforeCta: loadsBefore, afterCapture: hardLoads, extraLoadsDuringFlip: hardLoads - loadsBefore },
    before,
    after,
    overviewAfterSpaNav: overview,
    settingsApiAfter: { setupComplete: settingsAfter.setupComplete },
    verdict: {
      // The flip itself
      beforeUnchecked: before.setupItemChecked === false,
      beforeStyleSolicited: before.styleItemNextStep === true,
      afterChecked: after.setupItemChecked === true,
      afterStyleNotSolicited: after.styleItemNextStep === false,
      afterTwoOfFive: /Getting Started[\s\S]{0,40}2\/5/.test(after.sidebarText ?? ""),
      // The load-bearing constraint
      noDocumentReload: hardLoads - loadsBefore === 0,
      sentinelSurvived: typeof after.sentinel === "number",
      landedInEditor: /\/chapters\//.test(after.url ?? ""),
      settingsPersisted: settingsAfter.setupComplete === true,
    },
    trace,
    network: net.map((n) => ({ ...n, tMs: (n.at as number) - t0 })).filter((n) => (n.tMs as number) > -20000),
    capturedAt: new Date().toISOString(),
  };
  writeFileSync(`${outDir}/45h-assertions.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ walk, ctaMs: report.ctaMs, documentLoads: report.documentLoads, verdict: report.verdict }, null, 2));
  console.log("--- before sidebar ---\n" + (before.sidebarText ?? ""));
  console.log("--- after sidebar ---\n" + (after.sidebarText ?? ""));
  await browser.close();
})();
