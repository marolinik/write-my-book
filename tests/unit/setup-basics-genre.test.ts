import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { basicsComplete } from "@/lib/onboarding/setup-surface";

/**
 * The setup wizard held a writer on "basics" until they typed a genre, and
 * basics comes before import: a writer bringing a finished manuscript had to
 * label it before the product had read a word. The new-book form already
 * treats genre as optional, and the setup conversation now proposes a genre
 * from the chapters. So a named book has its basics.
 */

describe("basicsComplete", () => {
  it("needs a name, not a genre", () => {
    expect(basicsComplete({ name: "Legat - Zakletva", genre: null })).toBe(true);
    expect(basicsComplete({ name: "Legat - Zakletva", genre: "Istorijski triler" })).toBe(true);
  });

  it("is not complete without a name", () => {
    expect(basicsComplete({ name: "", genre: "Triler" })).toBe(false);
    expect(basicsComplete(undefined)).toBe(false);
  });

  it("is the one rule both surfaces use", () => {
    for (const f of ["src/hooks/use-book-state.ts", "src/app/(app)/books/[bookId]/page.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/basicsComplete: !!\(book\??\.name && book\??\.genre\)/);
      expect(src).toContain("basicsComplete(book)");
    }
  });
});
