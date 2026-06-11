import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import {
  test,
  expect,
  createBookViaApi,
  createChapterViaApi,
  createFindingViaApi,
} from "./fixtures";

/**
 * Tier 2.5 accessibility — desktop viewport (chromium project; the mobile
 * spec is scoped to mobile-chromium by filename).
 *
 * Covers spec §4: axe WCAG 2.0/2.1 A+AA scans on three editor surfaces,
 * plus the keyboard paths — gutter marker → review dialog with Accept
 * focused, F8 finding cycling with polite live-region announcements, the
 * Ctrl+/ shortcuts dialog documenting F8, and the contenteditable's
 * textbox semantics.
 */

// Editor hydration + axe injection + smooth-scroll settle delays exceed the
// global 30s budget under full parallelism against a dev server.
test.describe.configure({ timeout: 90_000 });

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CONTENT_URL = (bookId: string, chapterId: string) =>
  `/api/books/${bookId}/chapters/${chapterId}/content`;

const CHAPTER_TITLE = "A11y Spec";
const FINDING_A_TEXT = "The long day slowly passed.";
const FINDING_B_TEXT = "The town slept beneath the hills.";
const FINDING_A_DESCRIPTION = "This paragraph drags.";
const FINDING_B_DESCRIPTION = "Flat imagery in this sentence.";
// First sentence is intentionally finding-free so clicks land outside
// annotation spans (clicking one would open the review tooltip).
const SEED_MARKDOWN = `The harbor lay quiet under the morning fog. ${FINDING_A_TEXT} ${FINDING_B_TEXT}`;

const EDITOR_READY_TIMEOUT_MS = 15_000;
const PANEL_TIMEOUT_MS = 15_000;
/** Caret drop target inside the un-annotated first sentence. */
const EDITOR_CLICK_POSITION = { x: 24, y: 16 };

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

/** Seed the "pacing" finding anchored to FINDING_A_TEXT. */
async function seedFindingA(
  request: APIRequestContext,
  bookId: string
): Promise<void> {
  await createFindingViaApi(request, bookId, {
    chapterNumber: 1,
    agentType: "dev-editor",
    severity: "important",
    category: "pacing",
    description: FINDING_A_DESCRIPTION,
    originalText: FINDING_A_TEXT,
    suggestedText: "The day passed.",
  });
}

/** Seed the "imagery" finding anchored to FINDING_B_TEXT. */
async function seedFindingB(
  request: APIRequestContext,
  bookId: string
): Promise<void> {
  await createFindingViaApi(request, bookId, {
    chapterNumber: 1,
    agentType: "line-editor",
    severity: "important",
    category: "imagery",
    description: FINDING_B_DESCRIPTION,
    originalText: FINDING_B_TEXT,
    suggestedText: "The town lay dark beneath the hills.",
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

/** Run an axe scan restricted to the WCAG 2.0/2.1 A+AA rule tags. */
async function scanForViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();
  return results.violations;
}

/** Gutter marker for finding A (aria-label `${category} finding: ...`). */
function gutterMarkerA(page: Page) {
  return page.getByRole("button", { name: /pacing finding/i });
}

function reviewDialog(page: Page) {
  return page.getByRole("dialog", { name: "Review suggestion" });
}

/**
 * The announcer's persistent last-message attribute — the region's TEXT
 * self-clears after 3s (required for AT), which makes text assertions racy.
 */
function lastAnnouncement(page: Page) {
  return page.locator("[data-last-announcement]");
}

test.describe("Editor accessibility (WCAG 2.1 AA)", () => {
  // ── 1. axe: chapter editor, idle ─────────────────────────────────
  test("axe: chapter editor idle has no WCAG A/AA violations", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y Idle ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    expect(await scanForViolations(page)).toEqual([]);
  });

  // ── 2. axe: findings panel open (inline on lg) ───────────────────
  test("axe: findings panel open has no WCAG A/AA violations", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y Findings ${Date.now()}-w${testInfo.workerIndex}`
    );
    await seedFindingA(request, bookId);
    await openEditor(page, bookId, chapterId);

    // On lg+ pending findings auto-open the inline (resizable) panel.
    await expect(
      page.getByText(FINDING_A_DESCRIPTION).first()
    ).toBeVisible({ timeout: PANEL_TIMEOUT_MS });

    expect(await scanForViolations(page)).toEqual([]);
  });

  // ── 3. axe: version history open ─────────────────────────────────
  test("axe: version history open has no WCAG A/AA violations", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y History ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    // Inline w-64 history column on lg+. The panel shows the seeded v1 once
    // the chapter's document id resolves; fall back to its empty state.
    await page.getByRole("button", { name: "Version History" }).click();
    await expect(
      page
        .getByText("v1", { exact: true })
        .or(page.getByText("Save content to see version history"))
        .first()
    ).toBeVisible({ timeout: PANEL_TIMEOUT_MS });

    expect(await scanForViolations(page)).toEqual([]);
  });

  // ── 4. Keyboard: gutter marker → review dialog, Accept focused ───
  test("keyboard: gutter marker opens the review dialog with Accept focused", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y Marker ${Date.now()}-w${testInfo.workerIndex}`
    );
    await seedFindingA(request, bookId);
    await openEditor(page, bookId, chapterId);

    // Marker visible ⇒ findings + annotation positions resolved.
    await expect(gutterMarkerA(page)).toBeVisible({
      timeout: PANEL_TIMEOUT_MS,
    });

    // Place the caret in the un-annotated first sentence, then Shift+Tab —
    // the marker is the editor area's preceding tab stop.
    await page
      .locator(".ProseMirror")
      .click({ position: EDITOR_CLICK_POSITION });
    await page.keyboard.press("Shift+Tab");
    await expect(gutterMarkerA(page)).toBeFocused();

    // Enter activates the marker: the Accept/Reject review dialog opens
    // and moves focus to Accept (spec §2 — THE keyboard path to act on
    // annotations).
    await page.keyboard.press("Enter");
    await expect(reviewDialog(page)).toBeVisible();
    await expect(
      reviewDialog(page).getByRole("button", { name: "Accept" })
    ).toBeFocused();

    // Escape closes and returns focus to the editor.
    await page.keyboard.press("Escape");
    await expect(reviewDialog(page)).toBeHidden();
    await expect(
      page.locator('[contenteditable="true"]').first()
    ).toBeFocused();
  });

  // ── 5. Keyboard: F8 cycles findings + live region announces ──────
  test("keyboard: F8 cycles findings and announces via the live region", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y F8 ${Date.now()}-w${testInfo.workerIndex}`
    );
    await seedFindingA(request, bookId);
    await seedFindingB(request, bookId);
    await openEditor(page, bookId, chapterId);

    // Markers visible ⇒ navigable finding ids are synced to the store.
    await expect(gutterMarkerA(page)).toBeVisible({
      timeout: PANEL_TIMEOUT_MS,
    });

    // First F8: selects finding 1 (document order), announces politely,
    // then opens the same review tooltip the gutter click opens.
    await page.keyboard.press("F8");
    await expect(lastAnnouncement(page)).toHaveAttribute(
      "data-last-announcement",
      /Finding 1 of 2/
    );
    await expect(reviewDialog(page)).toBeVisible();

    // The dialog holds focus (Accept) and the F8 guard ignores presses
    // inside dialogs — Escape back to the editor before advancing.
    await page.keyboard.press("Escape");
    await expect(reviewDialog(page)).toBeHidden();
    await expect(
      page.locator('[contenteditable="true"]').first()
    ).toBeFocused();

    await page.keyboard.press("F8");
    await expect(lastAnnouncement(page)).toHaveAttribute(
      "data-last-announcement",
      /Finding 2 of 2/
    );
  });

  // ── 6. Keyboard: Ctrl+/ shortcuts dialog documents F8 ────────────
  test("keyboard: Ctrl+/ opens the shortcuts dialog listing F8", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y Shortcuts ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    await page.keyboard.press("Control+/");
    const dialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByText("Next finding (opens review)")
    ).toBeVisible();
    await expect(dialog.getByText("F8", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Shift+F8", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  // ── 7. Contenteditable carries textbox semantics ─────────────────
  test("editor contenteditable is an accessible multiline textbox", async ({
    page,
    request,
  }, testInfo) => {
    const { bookId, chapterId } = await seedChapter(
      request,
      `A11y Textbox ${Date.now()}-w${testInfo.workerIndex}`
    );
    await openEditor(page, bookId, chapterId);

    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toHaveAttribute("role", "textbox");
    await expect(editor).toHaveAttribute("aria-multiline", "true");
    await expect(editor).toHaveAttribute(
      "aria-label",
      `Editing chapter 1: ${CHAPTER_TITLE}`
    );
  });
});
