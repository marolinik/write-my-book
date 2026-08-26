import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * D-195 (P1 47-series) — recharts bars rendered black in BOTH themes because
 * Tailwind-v3-era code wrapped the design tokens in `hsl(...)`. The tokens in
 * globals.css are oklch (`--primary: oklch(0.205 0 0)` light,
 * `oklch(0.922 0 0)` dark), so `hsl(oklch(0.205 0 0))` is invalid CSS: the
 * declaration falls back to the initial value, black. Light mode hid the bug
 * (the intended --primary is already near-black); dark mode inverts the token
 * to near-white but still painted black, leaving the writer's streak and
 * word-count charts invisible against the near-black panel. Captured live in
 * 47g-assertions.json: barsLight and barsDark both `fill: "rgb(0, 0, 0)"`.
 *
 * The tokens are already complete colour values, so `var(--x)` is the whole
 * fix. This guards the idiom, not one call site: `hsl(var(--` must not come
 * back anywhere under src/, in a JSX prop, an inline style, or a Tailwind
 * arbitrary value.
 */

const SRC = join(process.cwd(), "src");
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".css"];

/**
 * Every source and stylesheet file under src/. The generated Prisma client is
 * skipped: it is machine-written TypeScript with no styling in it.
 */
function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true })
    .map((entry) => String(entry))
    .filter((rel) => !rel.startsWith(`generated${sep}`))
    .filter((rel) => SCANNED_EXTENSIONS.some((ext) => rel.endsWith(ext)));
}

describe("D-195 — oklch tokens are not wrapped in hsl()", () => {
  it("no file under src/ wraps a design token in hsl()", () => {
    const offenders = sourceFiles().flatMap((rel) => {
      const source = readFileSync(join(SRC, rel), "utf8");
      return source
        .split("\n")
        .map((text, i) => ({ line: i + 1, text }))
        .filter(({ text }) => text.includes("hsl(var(--"))
        .map(({ line, text }) => `src/${rel.split(sep).join("/")}:${line}: ${text.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it("the sweep actually reads the files that carried the defect", () => {
    const scanned = sourceFiles();
    expect(scanned).toContain(join("components", "book", "daily-word-chart.tsx"));
    expect(scanned).toContain(join("components", "reports", "analytics-tab.tsx"));
    expect(scanned).toContain(join("components", "ui", "sidebar.tsx"));
    expect(scanned).toContain(join("app", "globals.css"));
  });

  it("the charts the panel named paint from the token directly", () => {
    const dailyWords = readFileSync(join(SRC, "components/book/daily-word-chart.tsx"), "utf8");
    const analytics = readFileSync(join(SRC, "components/reports/analytics-tab.tsx"), "utf8");
    expect(dailyWords).toContain('fill="var(--primary)"');
    expect(analytics).toContain('fill="var(--primary)"');
    expect(analytics).toContain('backgroundColor: "var(--card)"');
  });

  it("the translucent hover cursor mixes the token instead of an hsl alpha slash", () => {
    const dailyWords = readFileSync(join(SRC, "components/book/daily-word-chart.tsx"), "utf8");
    // `var(--muted) / 0.3` is not valid outside a colour function, so the 30%
    // cursor tint has to go through color-mix.
    expect(dailyWords).toContain("color-mix(in oklab, var(--muted) 30%, transparent)");
    expect(dailyWords).not.toMatch(/var\(--muted\)\s*\/\s*0\.3/);
  });
});
