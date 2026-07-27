import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mainBottomPaddingClass } from "@/lib/layout/fab-clearance";

/**
 * D-139 (S3, third recurrence — P6 v3 judges A+C asked for the "2-line offset
 * fix") — the fixed AI companion bubble (`fixed bottom-5 right-5 size-12`, and
 * `bottom-20` on mobile above the h-14 bottom nav) sits on top of whatever page
 * content ends in the bottom-right corner. On the book overview the chapters
 * table's Action column renders as "Ed…" instead of "Edit" (45a/45g).
 *
 * Fix: the scrolling content column reserves enough bottom room that no row can
 * come to rest under the bubble. Full-width surfaces (editor, editorial review)
 * own their own scroll regions and internal chrome, so they keep only the mobile
 * bottom-nav reserve.
 */

const LAYOUT_SOURCE = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

describe("D-139 — content clears the floating bubble", () => {
  it("reserves room under desktop content pages", () => {
    expect(mainBottomPaddingClass({ pathname: "/books/abc", isMobile: false })).toBe("pb-20");
    expect(mainBottomPaddingClass({ pathname: "/books", isMobile: false })).toBe("pb-20");
    expect(mainBottomPaddingClass({ pathname: "/settings/billing", isMobile: false })).toBe("pb-20");
  });

  it("reserves the bottom nav AND the bubble on mobile content pages", () => {
    expect(mainBottomPaddingClass({ pathname: "/books/abc", isMobile: true })).toBe("pb-32");
  });

  it("leaves full-width surfaces to their own scroll regions", () => {
    expect(mainBottomPaddingClass({ pathname: "/books/abc/chapters/ch1", isMobile: false })).toBe("");
    expect(mainBottomPaddingClass({ pathname: "/books/abc/editorial", isMobile: false })).toBe("");
    // Mobile still needs the bottom-nav reserve there.
    expect(mainBottomPaddingClass({ pathname: "/books/abc/chapters/ch1", isMobile: true })).toBe("pb-14");
  });

  it("emits exactly one padding-bottom class (two would race in the stylesheet)", () => {
    for (const isMobile of [true, false]) {
      for (const pathname of ["/books/abc", "/books/abc/chapters/ch1", "/settings"]) {
        const classes = mainBottomPaddingClass({ pathname, isMobile }).split(/\s+/).filter(Boolean);
        expect(classes.filter((c) => c.startsWith("pb-")).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("the app shell uses the helper instead of a hardcoded pb on <main>", () => {
    expect(LAYOUT_SOURCE).toMatch(/mainBottomPaddingClass/);
    const mainTags = LAYOUT_SOURCE.match(/<main[^>]*>/g) ?? [];
    expect(mainTags.length).toBeGreaterThan(0);
    for (const tag of mainTags) expect(tag).not.toMatch(/\bpb-\d/);
  });
});
