import { test, expect } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

// UDG-11 (Jelena): the Book Development hub is fully localized in 7 locales
// (en, sr, de, es, fr, ru, zh). A hub that renders in Serbian proves the server
// component exercises the selected dictionary end-to-end without crashing on a
// missing/changed i18n key — catching regressions unit tests (which check key
// presence, not runtime rendering) would miss.
//
// Uses a dedicated language persona (user_qa_lang, seeded by qa-seed-personas)
// so the mutation doesn't touch any shared e2e or persona user.

const LANG_HEADERS = {
  "x-e2e-test-secret": process.env.E2E_TEST_SECRET || "test-secret",
  "x-e2e-clerk-id": "user_qa_lang",
};

// Book names must be unique per invocation — the create API returns 409 on a
// name collision, and Playwright retries would otherwise re-create a book with
// the same name. Timestamp-suffix keeps names unique across retries/runs.
const RUN = Date.now();

function ok(status: number): boolean {
  return status === 200 || status === 201;
}

async function setLanguage(request: APIRequestContext, _bookId: string, language: string): Promise<void> {
  // The language is global per user; PATCH only needs the language code.
  const res = await request.patch(`/api/settings/language`, {
    data: { language },
    headers: LANG_HEADERS,
  });
  expect(res.status(), `set ${language} language`).toBe(200);
}

test.describe("Book Development hub — language smoke (UDG-11)", () => {
  test("hub renders in Serbian for a user with preferredLanguage=sr", async ({
    page,
    request,
  }) => {
    // Restore a known starting language, then set Serbian.
    await setLanguage(request, "", "sr");

    const bookRes = await request.post(`/api/books`, {
      data: { name: `Lang Smoke SR ${RUN}`, genre: "Fantasy", language: "sr" },
      headers: LANG_HEADERS,
    });
    expect(ok(bookRes.status()), `create book sr (${bookRes.status()})`).toBe(true);
    const book = (await bookRes.json()) as { id: string; name: string };

    // Make the browser requests run as the language persona too.
    await page.context().setExtraHTTPHeaders(LANG_HEADERS);
    await page.goto(`/books/${book.id}/dev`);
    await page.waitForLoadState("networkidle");

    // The hub header must be the Serbian title, not English.
    const hubTitle = await page
      .getByRole("heading", { name: /razvoj knjige|razvoj/i })
      .first();
    await expect(hubTitle).toBeVisible();
    // And the pipeline first stage renders in Serbian ("Ideja" for Idea).
    await expect(
      page.getByRole("heading", { name: /^1\.\s*Ideja/ }).first()
    ).toBeVisible();

    // Restore English for hygiene.
    await setLanguage(request, "", "en");
  });

  test("hub does not crash across the other supported locales", async ({
    page,
    request,
  }) => {
    // Quick loop: for a fresh book per locale, load the hub and assert the
    // pipeline still renders (no runtime error from a missing i18n key).
    const locales: Array<{ code: string; label: string; stage: string }> = [
      { code: "de", label: "Entwicklung", stage: "Idee" },
      { code: "es", label: "Desarrollo", stage: "Idea" },
      { code: "fr", label: "Développement", stage: "Idée" },
      { code: "ru", label: "Разработка", stage: "Идея" },
      { code: "zh", label: "书籍开发", stage: "构思" },
    ];

    for (const loc of locales) {
      await setLanguage(request, "", loc.code);
      const bookRes = await request.post(`/api/books`, {
        data: {
          name: `Lang Smoke ${loc.code} ${RUN}`,
          genre: "Fantasy",
          language: loc.code,
        },
        headers: LANG_HEADERS,
      });
      expect(
        ok(bookRes.status()),
        `create book ${loc.code} (${bookRes.status()})`
      ).toBe(true);
      const book = (await bookRes.json()) as { id: string };

      await page.goto(`/books/${book.id}/dev`);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: new RegExp(`^1\\.\\s*${loc.stage}`, "i") })
          .first()
      ).toBeVisible();
    }

    await setLanguage(request, "", "en");
  });
});