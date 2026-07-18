import type { APIRequestContext, Page, BrowserContext } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * §W4 / X1 — two-tab edit war drill.
 *
 * Two independent browser contexts (simulating two real devices/tabs — e.g.
 * "left my laptop open, also edited on my phone") edit the SAME chapter
 * concurrently as the SAME persona (`user_qa_p2`). Proves, under an ACTUAL
 * two-writer race rather than the single-tab-vs-API-write simulation in
 * offline-autosave.spec.ts:
 *   - A3.2: a real 409 conflict suspends the losing tab's autosave and
 *     surfaces a non-blocking "Review" toast — the dialog never auto-opens,
 *     typing is never interrupted, the loser's words are never silently
 *     dropped or overwritten.
 *   - A3.14: SaveConflictDialog's Keep-mine / Load-theirs choice, and that
 *     Load-theirs backs up the loser's words (as a recoverable version)
 *     before discarding them from the live editor.
 *
 * Fixture: each test creates its OWN fresh book+chapter under user_qa_p2 —
 * NOT the shared campaign throwaway fixture. That fixture is concurrently
 * written to by other teammates' probes (observed live during this drill:
 * a "PROBE2-..." marker from an unrelated agent landed on the shared chapter
 * mid-run and broke this test's baseline assumption). An automated spec that
 * seeds a known baseline and asserts on exact content across two page loads
 * is inherently incompatible with sharing state with other concurrently
 * running agents, so isolation is the correct fix, not a retry.
 *
 * IMPORTANT — local environment hazard: the default Playwright baseURL
 * (localhost:3000) resolves to a DIFFERENT unrelated app ("LM Tek Cockpit")
 * on this machine, not wmb-pub. wmb-pub's dev server is on :3002. This spec
 * is written to be run with `PLAYWRIGHT_BASE_URL=http://localhost:3002`
 * explicitly — see the run command in journey-log.md. Running the full
 * `npm run test:e2e` suite without that env var would silently point every
 * spec at the wrong application.
 */

test.describe.configure({ timeout: 90_000 });

const QA_HEADERS = {
  "x-e2e-test-secret": process.env.E2E_TEST_SECRET || "test-secret",
  "x-e2e-clerk-id": "user_qa_p2",
};
test.use({ extraHTTPHeaders: QA_HEADERS });

/**
 * Create a fresh book, seed baseline content into its auto-created chapter 1,
 * return ids + content URL.
 *
 * POST /api/books now auto-creates chapterNumber:1 (src/app/api/books/route.ts:108)
 * and returns it as `firstChapterId` — calling createChapterViaApi afterwards
 * to explicitly create "chapter 1" collides on the unique (bookId,
 * chapterNumber) constraint and 500s. Discovered live during this drill.
 */
async function createFixture(
  request: APIRequestContext,
  name: string,
  baseline: string
): Promise<{ bookId: string; chapterId: string; contentUrl: string }> {
  const res = await request.post("/api/books", {
    data: { name, genre: "Fantasy", language: "en" },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const book = await res.json();
  const bookId = book.id as string;
  const chapterId = book.firstChapterId as string;
  expect(chapterId, "book creation must return firstChapterId").toBeTruthy();

  const contentUrl = `/api/books/${bookId}/chapters/${chapterId}/content`;
  const putRes = await request.put(contentUrl, { data: { markdown: baseline } });
  expect(putRes.ok(), await putRes.text()).toBe(true);
  return { bookId, chapterId, contentUrl };
}

async function openEditor(
  page: Page,
  bookId: string,
  chapterId: string,
  expectedText: string
): Promise<void> {
  await page.goto(`/books/${bookId}/chapters/${chapterId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".ProseMirror")).toContainText(expectedText, {
    timeout: 15_000,
  });
}

async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

function saveStatus(page: Page) {
  return page.getByTestId("editor-save-status");
}

function conflictChip(page: Page) {
  return page.getByRole("button", { name: /Conflict/ });
}

async function getServerContent(
  request: APIRequestContext,
  contentUrl: string
) {
  const res = await request.get(contentUrl);
  expect(res.ok()).toBe(true);
  return res.json() as Promise<{
    markdown: string;
    version?: number;
    documentId?: string;
  }>;
}

test.describe("X1 — two-tab edit war (real concurrent writers, no offline simulation)", () => {
  test("losing tab: honest 409, non-blocking Review toast, dialog never auto-opens, no silent overwrite — Keep mine", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    const baseline = `Two-tab drill baseline ${Date.now()}-w${testInfo.workerIndex}.`;
    const { bookId, chapterId, contentUrl } = await createFixture(
      request,
      `X1 Drill A ${Date.now()}-w${testInfo.workerIndex}`,
      baseline
    );

    // Tab A (page fixture)
    await openEditor(page, bookId, chapterId, baseline);

    // Tab B — genuinely separate browser context, same persona.
    const contextB: BrowserContext = await browser.newContext({
      extraHTTPHeaders: QA_HEADERS,
    });
    const pageB = await contextB.newPage();
    await openEditor(pageB, bookId, chapterId, baseline);

    // A edits and wins the race first.
    const aWords = ` Tab A wins this round.`;
    await typeInEditor(page, aWords);
    await expect(saveStatus(page)).toContainText("Saved", { timeout: 15_000 });

    const afterA = await getServerContent(request, contentUrl);
    expect(afterA.markdown).toContain("Tab A wins");

    // B, unaware A already saved, edits and autosaves — its stamped PUT
    // carries the stale (pre-A) version and must 409.
    const bWords = ` Tab B never saw A's save.`;
    await typeInEditor(pageB, bWords);

    // Losing tab: conflict surfaces as a durable status-bar chip; the dialog
    // must NOT be open yet (never auto-opens — typing is never interrupted).
    await expect(conflictChip(pageB)).toBeVisible({ timeout: 20_000 });
    await expect(pageB.getByRole("dialog")).toHaveCount(0);

    // B's own words are still live in its editor — nothing silently reverted.
    await expect(pageB.locator(".ProseMirror")).toContainText(
      "Tab B never saw A's save"
    );
    // Server still holds A's version — B's edits were never silently applied.
    const stillA = await getServerContent(request, contentUrl);
    expect(stillA.markdown).toContain("Tab A wins");
    expect(stillA.markdown).not.toContain("Tab B never saw");

    await pageB.screenshot({
      path: "cowork/bulletproof-qa-2026-07-17/evidence/w4-ui-drills/screenshots/x1-b-conflict-chip-dialog-closed.png",
      fullPage: true,
    });

    // Explicit Review action opens the dialog (A3.14).
    await conflictChip(pageB).click();
    await expect(
      pageB.getByRole("heading", { name: "Chapter changed outside this editor" })
    ).toBeVisible({ timeout: 10_000 });
    const dialog = pageB.getByRole("dialog");
    await expect(dialog).toContainText("Tab B never saw A's save");
    await expect(dialog).toContainText("Tab A wins");
    await expect(pageB.getByRole("button", { name: "Keep mine" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Load theirs" })).toBeVisible();

    await pageB.screenshot({
      path: "cowork/bulletproof-qa-2026-07-17/evidence/w4-ui-drills/screenshots/x1-b-conflict-dialog-open-diff.png",
      fullPage: true,
    });

    // Resolve: Keep mine — B's words win, stamped against A's version.
    await pageB.getByRole("button", { name: "Keep mine" }).click();
    await expect(saveStatus(pageB)).toContainText("Saved", { timeout: 15_000 });
    await expect(conflictChip(pageB)).toHaveCount(0);

    const resolved = await getServerContent(request, contentUrl);
    expect(resolved.markdown).toContain("Tab B never saw A's save");
    // A's words are not in the LIVE doc anymore, but were a real, separately
    // persisted DocumentVersion (created by A's own successful save) before
    // B's resolve overwrote head — not fabricated by this test, just noting
    // the mechanism: no explicit backup-save is needed on the Keep-mine path
    // because the loser (here, effectively A's snapshot) already exists as
    // its own prior version row.

    await contextB.close();
  });

  test("losing tab: Load theirs backs up the loser's words before discarding them (no data loss)", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    const baseline = `Two-tab drill baseline B ${Date.now()}-w${testInfo.workerIndex}.`;
    const { bookId, chapterId, contentUrl } = await createFixture(
      request,
      `X1 Drill B ${Date.now()}-w${testInfo.workerIndex}`,
      baseline
    );

    await openEditor(page, bookId, chapterId, baseline);
    const contextB = await browser.newContext({ extraHTTPHeaders: QA_HEADERS });
    const pageB = await contextB.newPage();
    await openEditor(pageB, bookId, chapterId, baseline);

    const aWords = ` A's winning save.`;
    await typeInEditor(page, aWords);
    await expect(saveStatus(page)).toContainText("Saved", { timeout: 15_000 });

    const bWords = ` B's words that are about to be discarded on purpose.`;
    await typeInEditor(pageB, bWords);
    await expect(conflictChip(pageB)).toBeVisible({ timeout: 20_000 });

    await conflictChip(pageB).click();
    await expect(pageB.getByRole("dialog")).toBeVisible();
    await pageB.getByRole("button", { name: "Load theirs" }).click();

    // Editor content replaces with the server (A's) version.
    await expect(pageB.locator(".ProseMirror")).toContainText(
      "A's winning save",
      { timeout: 15_000 }
    );
    await expect(pageB.locator(".ProseMirror")).not.toContainText(
      "about to be discarded"
    );
    await expect(pageB.getByRole("dialog")).toHaveCount(0);

    // Server head now matches A's content.
    const finalContent = await getServerContent(request, contentUrl);
    expect(finalContent.markdown).toContain("A's winning save");
    const docId = finalContent.documentId as string;
    expect(docId, "content response must carry documentId to check versions").toBeTruthy();

    // B's discarded words are not silently gone: handleLoadTheirs() does an
    // unguarded backup PUT (changeSource "conflict-backup") BEFORE replacing
    // the live editor content. Walk the real DocumentVersion list (chapters
    // and documents share the same /documents/:docId/versions route — a
    // chapter's content doc is just DocumentType.CHAPTER_CONTENT) and prove
    // a "conflict-backup" row exists whose actual stored content contains
    // B's words.
    const versionsRes = await request.get(
      `/api/books/${bookId}/documents/${docId}/versions`
    );
    expect(versionsRes.ok(), await versionsRes.text()).toBe(true);
    const versions: Array<{ version: number; changeSource: string | null }> =
      await versionsRes.json();
    const backupRow = versions.find((v) => v.changeSource === "conflict-backup");
    expect(
      backupRow,
      `expected a conflict-backup version row, got: ${JSON.stringify(versions)}`
    ).toBeTruthy();

    const backupContentRes = await request.get(
      `/api/books/${bookId}/documents/${docId}/versions/${backupRow!.version}`
    );
    expect(backupContentRes.ok()).toBe(true);
    const backupContent = await backupContentRes.json();
    expect(backupContent.content).toContain("about to be discarded");

    await contextB.close();
  });
});
