import type { APIRequestContext, Page } from "@playwright/test";
import {
  test,
  expect,
  createBookViaApi,
  createChapterViaApi,
  createFindingViaApi,
} from "./fixtures";

/**
 * Tier 2.4 mobile editor — runs ONLY under the `mobile-chromium` project
 * (Pixel 7, 412×915 CSS px; playwright.config.ts scopes /mobile-.*\.spec\.ts/
 * to that project, and the desktop projects ignore it).
 *
 * Covers spec §4: phone layout integrity (no horizontal overflow), the
 * two-stage toolbar collapse (compact density + "More tools" overflow),
 * autosave with the status bar clearing the bottom nav (dvh height-calc
 * fix), the findings bottom Sheet, the version-history right Sheet, and
 * the absence of split view on phones.
 */

// Editor hydration, the ~2s autosave debounce, and sheet animations don't
// fit the global 30s budget when the file runs in parallel against a dev
// server.
test.describe.configure({ timeout: 90_000 });

const CONTENT_URL = (bookId: string, chapterId: string) =>
  `/api/books/${bookId}/chapters/${chapterId}/content`;

const CHAPTER_TITLE = "Mobile Spec";
const FINDING_TEXT = "The long day slowly passed.";
const FINDING_DESCRIPTION = "This paragraph drags on a phone.";
const SEED_MARKDOWN = `The harbor lay quiet under the morning fog. ${FINDING_TEXT}`;

const EDITOR_READY_TIMEOUT_MS = 15_000;
const SAVE_TIMEOUT_MS = 20_000;
/** Rounding tolerance for bounding-box comparisons. */
const BOX_EPSILON_PX = 1;
/** The bottom sheet (h-[70dvh]) must leave the top of the screen clear. */
const BOTTOM_SHEET_MIN_TOP_RATIO = 0.15;

/** Create book + chapter and seed content (v1); returns ids. */
async function seedChapter(
  request: APIRequestContext,
  name: string
): Promise<{ bookId: string; chapterId: string }> {
  const book = await createBookViaApi(request, { name });
  const chapter = await createChapterViaApi(request, book.id, {
    chapterNumber: 1,
    title: CHAPTER_TITLE,
  });
  const res = await request.put(CONTENT_URL(book.id, chapter.id), {
    data: { markdown: SEED_MARKDOWN },
  });
  expect(res.ok()).toBe(true);
  return { bookId: book.id, chapterId: chapter.id };
}

/** Seed one pending finding anchored to FINDING_TEXT in the chapter. */
async function seedFinding(
  request: APIRequestContext,
  bookId: string
): Promise<void> {
  await createFindingViaApi(request, bookId, {
    chapterNumber: 1,
    agentType: "dev-editor",
    severity: "important",
    category: "pacing",
    description: FINDING_DESCRIPTION,
    originalText: FINDING_TEXT,
    suggestedText: "The day passed.",
  });
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
  await expect(editor).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
  await expect(page.locator(".ProseMirror")).toContainText("harbor", {
    timeout: EDITOR_READY_TIMEOUT_MS,
  });
}

/** Click into the editor and type at the end of the content. */
async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

function saveStatus(page: Page) {
  return page.getByTestId("editor-save-status");
}

function toolbar(page: Page) {
  return page.getByRole("toolbar", { name: "Editor toolbar" });
}

function moreToolsButton(page: Page) {
  return page.getByRole("button", { name: "More tools" });
}

function viewport(page: Page): { width: number; height: number } {
  const size = page.viewportSize();
  if (!size) throw new Error("viewportSize is null — device config missing");
  return size;
}

test.describe("Mobile editor (Pixel 7)", () => {
  // ── 1. Single column, no horizontal overflow ─────────────────────
  test("editor opens with no horizontal overflow", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Mobile Layout ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    // Document-level scrollWidth is a near-tautology (ancestor overflow
    // clipping hides real overflow) — assert on the actual containers.
    const overflowing = await page.evaluate(() => {
      const candidates = document.querySelectorAll<HTMLElement>(
        'main, .ProseMirror, [role="toolbar"]'
      );
      return Array.from(candidates)
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.tagName}.${el.className.toString().slice(0, 40)}`);
    });
    expect(overflowing).toEqual([]);
    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fitsViewport).toBe(true);
  });

  // ── 2. Toolbar compact density: overflow menu carries headings ───
  test("toolbar collapses to compact density with H1 in the overflow menu", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Mobile Toolbar ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await expect(toolbar(page)).toBeVisible();
    await expect(moreToolsButton(page)).toBeVisible();

    // The priority-collapse design means the toolbar itself never scrolls.
    const noToolbarScroll = await toolbar(page).evaluate(
      (el) => el.scrollWidth <= el.clientWidth
    );
    expect(noToolbarScroll).toBe(true);

    // Stage-2 reshuffle (<480px): headings live inside the overflow menu.
    await moreToolsButton(page).click();
    // Headings are CHECKABLE items (menuitemcheckbox) so the active heading
    // level is exposed to AT — not plain menuitems.
    await expect(
      page.getByRole("menuitemcheckbox", { name: /Heading 1/ })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  // ── 3. Autosave reaches Saved; status bar clears the bottom nav ──
  test("typing autosaves and the status bar stays above the bottom nav", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Mobile Save ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await typeInEditor(page, " Words typed on a phone.");
    await expect(saveStatus(page)).toContainText("Saved", {
      timeout: SAVE_TIMEOUT_MS,
    });

    // The dvh height-calc fix: the status bar must sit flush above the
    // fixed bottom nav, not underneath it (the old 56px dead-scroll bug).
    await expect(saveStatus(page)).toBeVisible();
    const statusBox = await saveStatus(page).boundingBox();
    const navBox = await page.locator("nav.fixed.bottom-0").boundingBox();
    if (!statusBox || !navBox) {
      throw new Error("save status or bottom nav has no bounding box");
    }
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(
      navBox.y + BOX_EPSILON_PX
    );
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(
      viewport(page).height
    );
  });

  // ── 4. Findings open as a bottom sheet with actionable cards ─────
  test("findings open in a bottom sheet; Escape closes and restores focus", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Mobile Findings ${Date.now()}-w${testInfo.workerIndex}`
    );
    await seedFinding(request, bookId);
    await openEditor(page, bookId, chapterId);

    // Below lg the panel never self-summons — the toolbar toggle (with its
    // pending-count badge) is the affordance. Label is dynamic:
    // "Toggle Findings" / "Toggle findings, N pending".
    const toggle = page.getByRole("button", { name: /toggle findings/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Radix Sheet with sr-only title "Findings", side="bottom" on phones.
    const sheet = page.getByRole("dialog", { name: "Findings" });
    await expect(sheet).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    const { width: vw, height: vh } = viewport(page);
    if (!sheetBox) throw new Error("findings sheet has no bounding box");
    // Bottom-anchored and full-width — not the old right-edge overlay.
    expect(sheetBox.y).toBeGreaterThan(vh * BOTTOM_SHEET_MIN_TOP_RATIO);
    expect(sheetBox.y + sheetBox.height).toBeGreaterThanOrEqual(
      vh - BOX_EPSILON_PX
    );
    expect(sheetBox.width).toBeGreaterThanOrEqual(vw - BOX_EPSILON_PX);

    // The finding card inside is fully actionable.
    await expect(sheet.getByText(FINDING_DESCRIPTION)).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Apply", exact: true })
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Dismiss", exact: true })
    ).toBeVisible();

    // Escape closes the sheet (the old overlay had no Escape path) and
    // Radix restores focus to the toolbar toggle.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  // ── 5. Version history opens as a right sheet ────────────────────
  test("version history opens as a right sheet from the overflow menu", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Mobile History ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    // At compact density the History toggle lives in the overflow menu.
    await moreToolsButton(page).click();
    await page.getByRole("menuitem", { name: "Version History" }).click();

    const sheet = page.getByRole("dialog", { name: /History: Chapter 1/ });
    await expect(sheet).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    if (!sheetBox) throw new Error("history sheet has no bounding box");
    // Right-anchored side sheet, not full-screen.
    expect(sheetBox.x + sheetBox.width).toBeGreaterThanOrEqual(
      viewport(page).width - BOX_EPSILON_PX
    );
    expect(sheetBox.width).toBeLessThan(viewport(page).width);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  // ── 6. Split view is not offered on phones ───────────────────────
  test("split view toggle is absent on phones", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `Mobile No Split ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    // Neither inline (either toggle label) ...
    await expect(
      page.getByRole("button", { name: "Split View" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Chapter Only" })
    ).toHaveCount(0);

    // ... nor inside the overflow menu.
    await moreToolsButton(page).click();
    await expect(
      page.getByRole("menuitem", { name: "Version History" })
    ).toBeVisible(); // menu is open and populated
    await expect(
      page.getByRole("menuitem", { name: "Split View" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Chapter Only" })
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});
