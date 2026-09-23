import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { updateBookSchema } from "@/lib/validation";

/**
 * The setup wizard's basics step asks for a description and threw it away:
 * the page never sent it, and the update schema would have stripped it if it
 * had. A writer who typed what their book is about lost it on "Next".
 */

describe("the book description survives the setup wizard", () => {
  it("is accepted by the update schema", () => {
    expect(updateBookSchema.parse({ description: "Istorijski triler." })).toEqual({
      description: "Istorijski triler.",
    });
    expect(updateBookSchema.parse({ description: null })).toEqual({ description: null });
  });

  it("is bounded", () => {
    expect(() => updateBookSchema.parse({ description: "x".repeat(5001) })).toThrow();
  });

  it("is sent by the basics step and loaded back into it", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(app)/books/[bookId]/setup/page.tsx"), "utf8");
    const save = page.slice(page.indexOf("const handleSaveBasics"), page.indexOf("next();", page.indexOf("const handleSaveBasics")));
    expect(save).toContain("description");
    expect(page).toMatch(/setDescription\(book\.description \?\? ""\)/);
  });
});
