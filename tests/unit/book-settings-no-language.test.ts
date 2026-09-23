import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { updateSettingsSchema } from "@/lib/validation";

/**
 * A book's language lives in one place: Book.language, which every agent,
 * check and translation reads. BookSettings carried a second `language`,
 * defaulting to "en", that nothing read and no screen wrote. On the owner's
 * Serbian book it said "en", and a later audit reported that as a bug. Two
 * sources for one fact is how the wrong one eventually gets read.
 */

describe("a book's language has one home", () => {
  it("the settings update refuses a language instead of storing it", () => {
    // The schema is strict: an unknown key is a 400, never silently kept.
    expect(updateSettingsSchema.safeParse({ language: "sr" }).success).toBe(false);
  });

  it("BookSettings has no language column", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model BookSettings {"), schema.indexOf("}", schema.indexOf("model BookSettings {")));
    expect(model).not.toMatch(/^\s+language\s/m);
  });

  it("the settings type no longer offers one", () => {
    const hook = readFileSync(join(process.cwd(), "src/hooks/use-settings.ts"), "utf8");
    expect(hook).not.toMatch(/^\s+language: string;/m);
  });
});
