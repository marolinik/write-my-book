import type { APIRequestContext, Page } from "@playwright/test";
import {
  test,
  expect,
  createBookViaApi,
  createChapterViaApi,
} from "./fixtures";

/**
 * Tier 2.2 offline resilience — IndexedDB draft buffer, sync-on-reconnect,
 * recovery-on-load, and the save-status indicator states.
 *
 * Mechanics these tests rely on:
 *  - `context.setOffline(true)` cuts the PAGE's network; the `request`
 *    fixture is a separate APIRequestContext and stays online — used to
 *    seed/inspect server state during an outage.
 *  - IndexedDB persists per browser context, so crash-recovery tests close
 *    the page and reopen a new one in the SAME context.
 *  - `page.close()` defaults to `runBeforeUnload: false`, silently bypassing
 *    the unload prompt — exactly what a crash simulation needs.
 */

// Multi-phase tests: editor hydration, 2s buffer ticks, offline transitions,
// and second-page crash recovery don't fit the global 30s budget when the
// whole file runs in parallel against a dev server.
test.describe.configure({ timeout: 90_000 });

const CONTENT_URL = (bookId: string, chapterId: string) =>
  `/api/books/${bookId}/chapters/${chapterId}/content`;

const SEED_MARKDOWN = "The harbor lay quiet under the morning fog.";

/** Create book + chapter, seed content (v1), return ids. */
async function seedChapter(
  request: APIRequestContext,
  name: string
): Promise<{ bookId: string; chapterId: string }> {
  const book = await createBookViaApi(request, { name });
  const chapter = await createChapterViaApi(request, book.id, {
    chapterNumber: 1,
    title: "Offline Spec",
  });
  const res = await request.put(CONTENT_URL(book.id, chapter.id), {
    data: { markdown: SEED_MARKDOWN },
  });
  expect(res.ok()).toBe(true);
  return { bookId: book.id, chapterId: chapter.id };
}

/** Open the chapter editor and wait for content hydration. */
async function openEditor(
  page: Page,
  bookId: string,
  chapterId: string
): Promise<void> {
  await page.goto(`/books/${bookId}/chapters/${chapterId}`);
  await page.waitForLoadState("networkidle");
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".ProseMirror")).toContainText("harbor", {
    timeout: 15_000,
  });
}

/** Click into the editor and type. */
async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

function saveStatus(page: Page) {
  return page.getByTestId("editor-save-status");
}

/** Read the chapter's current server state through the online request fixture. */
async function getServerContent(
  request: APIRequestContext,
  bookId: string,
  chapterId: string
): Promise<{ markdown: string; version?: number }> {
  const res = await request.get(CONTENT_URL(bookId, chapterId));
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe("Offline autosave resilience", () => {
  test("offline typing shows the buffered-on-device indicator", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Offline Indicator ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await context.setOffline(true);
    await typeInEditor(page, " Words typed during the outage.");

    // The 2s buffer tick lands the draft in IndexedDB → amber indicator.
    await expect(saveStatus(page)).toContainText(
      "Offline — saved on this device",
      { timeout: 15_000 }
    );
  });

  test("reconnect syncs through the stamped PUT and purges the draft", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Offline Sync ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);
    const before = await getServerContent(request, bookId, chapterId);

    await context.setOffline(true);
    const marker = `reconnect-marker-${Date.now()}`;
    await typeInEditor(page, ` ${marker}`);
    await expect(saveStatus(page)).toContainText("Offline", {
      timeout: 15_000,
    });

    await context.setOffline(false);

    // Reconnect short-circuit saves immediately (no 60s backoff wait).
    await expect(saveStatus(page)).toContainText("Saved", { timeout: 20_000 });

    const after = await getServerContent(request, bookId, chapterId);
    expect(after.markdown).toContain(marker);
    expect(after.version).toBeGreaterThan(before.version ?? 0);

    // Hygiene: the successful save deletes this tab's draft row.
    const draftGone = await page.evaluate(async (key) => {
      return await new Promise<boolean>((resolve) => {
        const req = indexedDB.open("wmb-editor", 1);
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction("chapter-drafts", "readonly");
            const get = tx.objectStore("chapter-drafts").get(key);
            get.onsuccess = () => resolve(get.result === undefined);
            get.onerror = () => resolve(false);
          } catch {
            // Store missing entirely also means no lingering draft.
            resolve(true);
          }
        };
        req.onerror = () => resolve(false);
      });
    }, chapterId);
    expect(draftGone).toBe(true);
  });

  test("crash during outage recovers the draft on next load (clean base)", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Crash Recovery ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await context.setOffline(true);
    const marker = `crash-marker-${Date.now()}`;
    await typeInEditor(page, ` ${marker}`);
    // Wait for the buffered indicator — proves the IDB write completed.
    await expect(saveStatus(page)).toContainText(
      "Offline — saved on this device",
      { timeout: 15_000 }
    );

    // Crash: close without running beforeunload; reopen in the SAME context.
    await page.close();
    await context.setOffline(false);
    const reopened = await context.newPage();
    // Lighter open than openEditor: skip the networkidle wait — sonner
    // auto-dismisses the recovery toast after ~4s, and waiting for the
    // network to settle first can eat that whole window.
    await reopened.goto(`/books/${bookId}/chapters/${chapterId}`);
    await expect(reopened.locator(".ProseMirror")).toBeVisible({
      timeout: 15_000,
    });

    // Server didn't move (baseVersion === serverVersion) → silent restore
    // with a toast; the words are back in the editor and autosave persists.
    await expect(
      reopened.getByText("Recovered unsaved changes from your last session")
    ).toBeVisible({ timeout: 10_000 });
    await expect(reopened.locator(".ProseMirror")).toContainText(marker);
    await expect(saveStatus(reopened)).toContainText("Saved", {
      timeout: 20_000,
    });

    const after = await getServerContent(request, bookId, chapterId);
    expect(after.markdown).toContain(marker);
  });

  test("recovery lands in the conflict dialog when the server moved", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Recovery Conflict ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await context.setOffline(true);
    const mine = `mine-${Date.now()}`;
    await typeInEditor(page, ` ${mine}`);
    await expect(saveStatus(page)).toContainText(
      "Offline — saved on this device",
      { timeout: 15_000 }
    );

    // External writer bumps the server while this tab is offline.
    const theirs = `External rewrite theirs-${Date.now()}.`;
    const extPut = await request.put(CONTENT_URL(bookId, chapterId), {
      data: { markdown: theirs },
    });
    expect(extPut.ok()).toBe(true);

    await page.close();
    await context.setOffline(false);
    const reopened = await context.newPage();
    await openEditor(reopened, bookId, chapterId);

    // Draft base ≠ server version → conflict machinery, never an overwrite.
    const chip = reopened.getByRole("button", { name: /Conflict/ });
    await expect(chip).toBeVisible({ timeout: 15_000 });
    // My words are in the editor; the server still holds theirs.
    await expect(reopened.locator(".ProseMirror")).toContainText(mine);
    const preResolve = await getServerContent(request, bookId, chapterId);
    expect(preResolve.markdown).toContain(theirs.replace(/\.$/, ""));
    expect(preResolve.markdown).not.toContain(mine);

    // Resolve "Keep mine" → stamped PUT wins with explicit consent.
    await chip.click();
    // The dialog renders the diff of both versions before asking. (Heading
    // role — the conflict toast carries the same text and would otherwise
    // trip strict mode.)
    await expect(
      reopened.getByRole("heading", {
        name: "Chapter changed outside this editor",
      })
    ).toBeVisible({ timeout: 10_000 });
    const dialog = reopened.getByRole("dialog");
    await expect(dialog).toContainText(mine);
    const keepMine = reopened.getByRole("button", { name: "Keep mine" });
    await expect(keepMine).toBeVisible({ timeout: 10_000 });
    await keepMine.click();
    await expect(saveStatus(reopened)).toContainText("Saved", {
      timeout: 20_000,
    });

    const resolved = await getServerContent(request, bookId, chapterId);
    expect(resolved.markdown).toContain(mine);
  });

  test("live-tab reconnect with a moved server 409s into the conflict flow", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Live 409 ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await context.setOffline(true);
    const mine = `live-mine-${Date.now()}`;
    await typeInEditor(page, ` ${mine}`);
    await expect(saveStatus(page)).toContainText("Offline", {
      timeout: 15_000,
    });

    const theirs = `Live external theirs-${Date.now()}.`;
    const extPut = await request.put(CONTENT_URL(bookId, chapterId), {
      data: { markdown: theirs },
    });
    expect(extPut.ok()).toBe(true);

    await context.setOffline(false);

    // Reconnect save carries the stale stamp → 409 → conflict chip, and the
    // server is NOT silently overwritten: it still holds the external
    // writer's version verbatim until the user resolves.
    await expect(
      page.getByRole("button", { name: /Conflict/ })
    ).toBeVisible({ timeout: 20_000 });
    const server = await getServerContent(request, bookId, chapterId);
    expect(server.markdown).not.toContain(mine);
    expect(server.markdown).toContain(theirs.replace(/\.$/, ""));
  });

  test("unreachable server while online shows sync-pending, then self-heals", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Sync Pending ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    // navigator.onLine stays true; only the save PUT dies (dead-router case).
    await page.route("**/api/books/*/chapters/*/content", (route) => {
      if (route.request().method() === "PUT") {
        return route.abort();
      }
      return route.continue();
    });

    await typeInEditor(page, " Typed against a dead route.");
    await expect(saveStatus(page)).toContainText("Sync pending", {
      timeout: 20_000,
    });

    // Route restored → the backoff retry (2s, 4s, ...) lands the save.
    await page.unroute("**/api/books/*/chapters/*/content");
    await expect(saveStatus(page)).toContainText("Saved", {
      timeout: 30_000,
    });
  });

  test("degrades honestly when IndexedDB is unavailable", async ({
    browser,
    request,
  }, testInfo) => {
    // Fresh context so the init script applies before any app code runs.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined });
    });

    const { bookId, chapterId } = await seedChapter(
      request,
      `No IDB ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await context.setOffline(true);
    await typeInEditor(page, " Unprotected offline words.");

    // No buffer available → the red honest state, not a false reassurance.
    await expect(saveStatus(page)).toContainText(
      "Offline — changes not saved",
      { timeout: 15_000 }
    );

    // Everything still degrades to today's behavior: reconnect saves.
    await context.setOffline(false);
    await expect(saveStatus(page)).toContainText("Saved", { timeout: 20_000 });

    await context.close();
  });
});
