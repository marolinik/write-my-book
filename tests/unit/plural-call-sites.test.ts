/**
 * Every count the writer reads knows what language it is in.
 *
 * `pluralNoun` does the Slavic rule correctly — 1 глава, 2 главы, 5 глав — but
 * only when the call site tells it two things: the language, and the 2-4 form.
 * Without `language` it silently applies the English rule (count === 1), and
 * without `few` a three-form language falls back to the many form. Both
 * failures are silent and both produce text that is wrong in a way a native
 * reader notices immediately.
 *
 * The structure-proposal count on the book dev page passed neither, so Russian
 * rendered "2 предложений" where it should read "2 предложения". Serbian
 * escaped only by accident: its few and many forms of that noun happen to be
 * the same word.
 *
 * This is the contract that stops a new count from being added the same way.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { countWithNoun } from "@/lib/i18n/plural";

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("the Slavic rule", () => {
  it("reads the way a Russian reader expects", () => {
    const forms = ["глава", "глав"] as const;
    const few = "главы";
    const ru = (n: number) => countWithNoun(n, forms[0], forms[1], { few, language: "ru" });

    expect(ru(1)).toBe("1 глава");
    expect(ru(2)).toBe("2 главы");
    expect(ru(5)).toBe("5 глав");
    // The teens are the exception the rule exists for.
    expect(ru(11)).toBe("11 глав");
    expect(ru(12)).toBe("12 глав");
    expect(ru(21)).toBe("21 глава");
    expect(ru(22)).toBe("22 главы");
  });

  it("falls back to English rules when nobody says what language it is", () => {
    // This is the failure mode, asserted so the guard below has a reason.
    expect(countWithNoun(2, "глава", "глав", { few: "главы" })).toBe("2 глав");
  });
});

describe("every count in the product", () => {
  it("tells the pluraliser what language it is in", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf-8");
      if (file.endsWith(join("i18n", "plural.ts"))) continue;
      for (const match of text.matchAll(/\b(countWithNoun|pluralNoun)\(/g)) {
        // The call's own arguments, up to its closing paren at the same depth.
        const start = match.index! + match[0].length;
        let depth = 1;
        let end = start;
        while (end < text.length && depth > 0) {
          if (text[end] === "(") depth++;
          else if (text[end] === ")") depth--;
          end++;
        }
        // A mention inside a comment is not a call.
        const lineStart = text.lastIndexOf("\n", match.index!) + 1;
        const line = text.slice(lineStart, match.index!).trimStart();
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;

        const args = text.slice(start, end);
        if (!args.includes("language")) {
          offenders.push(`${file.slice(ROOT.length + 1).replace(/\\/g, "/")}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
