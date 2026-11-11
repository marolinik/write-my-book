import type { APIRequestContext } from "@playwright/test";
import { test, expect, createBookViaApi, createChapterViaApi, uniqueName } from "./fixtures";

/**
 * P1-5: typing in a chapter and switching to the next one within the 2 s
 * autosave window lost the typing, because the switch cleared the only armed
 * timer. The outgoing chapter is now saved on the switch.
 */

test.describe.configure({ timeout: 90_000 });

const CONTENT_URL = (bookId: string, chapterId: string) =>
  `/api/books/${bookId}/chapters/${chapterId}/content`;

async function seed(request: APIRequestContext) {
  const book = await createBookViaApi(request, { name: uniqueName("Chapter Switch") });
  const one = await createChapterViaApi(request, book.id, { chapterNumber: 1, title: "One" });
  const two = await createChapterViaApi(request, book.id, { chapterNumber: 2, title: "Two" });
  for (const [chapter, text] of [
    [one, "The first chapter opens at dawn."],
    [two, "The second chapter opens at dusk."],
  ] as const) {
    const res = await request.put(CONTENT_URL(book.id, chapter.id), { data: { markdown: text } });
    expect(res.ok()).toBe(true);
  }
  return { bookId: book.id, oneId: one.id, twoId: two.id };
}

test("text typed just before switching chapters reaches the server", async ({ page, request }) => {
  const { bookId, oneId } = await seed(request);
  await page.goto(`/books/${bookId}/chapters/${oneId}`);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toContainText("dawn", { timeout: 20_000 });

  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Nobody saw the boat.");

  // Within the 2 s autosave debounce: go to the next chapter in the app.
  await page.getByRole("button", { name: /next/i }).first().click();
  await expect(page.locator(".ProseMirror").first()).toContainText("dusk", { timeout: 20_000 });

  await expect
    .poll(
      async () => {
        const res = await request.get(CONTENT_URL(bookId, oneId));
        const body = await res.json();
        return String(body.markdown ?? body.content ?? "");
      },
      { timeout: 15_000 }
    )
    .toContain("Nobody saw the boat.");
});
