/**
 * L-7 / L-1 / L-2 / L-3 — one list of book languages, enforced at the boundary.
 *
 * `Book.language` is what every agent prompt enforces, and it was validated as
 * `z.string().min(2).max(10)`: `POST /api/books {"language":"xx"}` answered 201,
 * after which every prompt would order the manuscript written in "xx". The
 * pickers disagreed too — the creation page offered `hr`, which no other picker
 * can render (so the field afterwards showed empty), and hid `nl`, `pl`, `sv`
 * and `tr`, which are valid book languages. And four of the offered codes had
 * no entry in the prompt's name table, so the model was told "This book's
 * language is: sv (code: sv)."
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOK_LANGUAGES,
  BOOK_LANGUAGE_CODES,
  isBookLanguage,
} from "@/lib/i18n/book-languages";
import { LANGUAGE_NAMES } from "@/lib/agents/language-names";
import { createBookSchema, updateBookSchema, createSeriesSchema } from "@/lib/validation";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the API accepts only a language a book can be written in", () => {
  it("refuses the code the live probe got a 201 for", () => {
    expect(createBookSchema.safeParse({ name: "A", language: "xx" }).success).toBe(false);
    expect(updateBookSchema.safeParse({ language: "xx" }).success).toBe(false);
    expect(createSeriesSchema.safeParse({ title: "A", language: "xx" }).success).toBe(false);
  });

  it("accepts every code the pickers offer", () => {
    for (const { code } of BOOK_LANGUAGES) {
      expect(
        createBookSchema.safeParse({ name: "A", language: code }).success,
        `${code} was rejected`
      ).toBe(true);
    }
  });

  it("still defaults to English when no language is sent", () => {
    const parsed = createBookSchema.parse({ name: "A" });
    expect(parsed.language).toBe("en");
  });

  it("agrees with its own membership test", () => {
    expect(BOOK_LANGUAGE_CODES).toHaveLength(BOOK_LANGUAGES.length);
    expect(isBookLanguage("sr")).toBe(true);
    expect(isBookLanguage("xx")).toBe(false);
  });
});

describe("the pickers and the prompt read the same list", () => {
  it("the creation page offers BOOK_LANGUAGES, not the UI list", () => {
    const page = src("app", "(app)", "books", "new", "page.tsx");
    expect(page).toMatch(/BOOK_LANGUAGES\.map/);
    expect(page).not.toMatch(/SUPPORTED_LANGUAGES/);
  });

  it("the prompt can name every book language it may be given", () => {
    for (const { code } of BOOK_LANGUAGES) {
      const name = LANGUAGE_NAMES[code];
      expect(name, `no prompt name for ${code}`).toBeTruthy();
      // A name, not the code echoed back: "This book's language is: sv (code: sv)."
      expect(name).not.toBe(code);
    }
  });
});
