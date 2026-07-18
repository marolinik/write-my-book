import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * §W4 data-safety fault drills — the manual gaps NOT covered by
 * offline-autosave.spec.ts (which simulates a single-tab-vs-API-write, not
 * an immersive-mode crash or a real DOM console sweep):
 *
 *  - Z14: immersive focus mode's unload-flush guard (pagehide /
 *    visibilitychange:hidden), verified under three typing-burst durations
 *    against the FLAGSHIP-ADDENDUM claim of ~0s loss on a clean Escape-exit
 *    vs a small worst-case window on a hard crash.
 *  - Network-kill / crash-restart: the same scenarios offline-autosave.spec.ts
 *    covers, but run against `user_qa_p2` instead of the suite's default
 *    `user_test_e2e` — the latter is BLOCKED-ENV for book creation (see
 *    journey-log.md: global-setup.ts wipes the user's `subscriptions` row
 *    every run and never reseeds one, so it 403s the plan/quota gate before
 *    any test body runs).
 *  - Z13: rapid navigation + rapid panel open/close console hygiene.
 *
 * Each test creates its own fresh book (auto-creates chapter 1) — no shared
 * fixture, so no risk of the cross-agent contamination and the duplicate-
 * Document-row bug (candidate D-16) found on the shared throwaway fixture
 * during this drill.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost:3002 npx playwright test
 *      tests/e2e/w4-data-safety-drills.spec.ts --project=chromium
 */

test.describe.configure({ timeout: 90_000 });

const QA_HEADERS = {
  "x-e2e-test-secret": process.env.E2E_TEST_SECRET || "test-secret",
  "x-e2e-clerk-id": "user_qa_p2",
};
test.use({ extraHTTPHeaders: QA_HEADERS });

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

function saveStatus(page: Page) {
  return page.getByTestId("editor-save-status");
}

async function getServerContent(request: APIRequestContext, contentUrl: string) {
  const res = await request.get(contentUrl);
  expect(res.ok()).toBe(true);
  return res.json() as Promise<{ markdown: string; version?: number }>;
}

async function enterImmersive(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Focus mode options" }).click();
  await page.getByRole("button", { name: /Immersive/ }).click();
  await expect(page.getByRole("dialog", { name: "Immersive focus mode" })).toBeVisible({
    timeout: 10_000,
  });
}

function immersiveEditor(page: Page) {
  return page.getByRole("textbox", { name: "Distraction-free editor" });
}

// NOTE: Playwright's CDP keyboard dispatch can race a contentEditable's React
// reconciliation on fast, uniformly-paced synthetic typing — a documented
// class of flakiness across TipTap/Slate/Lexical, not something a real
// keyboard (different input pipeline, natural jitter) triggers. Type one
// character per awaited call at a human cadence and let each keystroke's
// input event round-trip before the next, rather than one bulk type() call.
async function typeSlow(page: Page, text: string): Promise<void> {
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 45 });
  }
}

async function typeForMs(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  words: string[],
  totalMs: number
): Promise<void> {
  await locator.click();
  await page.keyboard.press("Control+End");
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < totalMs) {
    await typeSlow(page, `${words[i % words.length]} `);
    i++;
    if (totalMs > 400) await page.waitForTimeout(300);
  }
}

test.describe("Z14 — immersive-mode unload flush", () => {
  for (const [label, burstMs] of [
    ["0s burst (single keystroke, immediate crash)", 0],
    ["5s burst (sub max-wait, immediate crash)", 5_000],
    ["30s burst (multiple max-wait cycles, immediate crash)", 30_000],
  ] as const) {
    test(`clean Escape-exit persists instantly; crash after ${label} recovers via unload guard`, async ({
      page,
      request,
      context,
    }, testInfo) => {
      const baseline = `Z14 baseline ${Date.now()}-w${testInfo.workerIndex}.`;
      const { bookId, chapterId, contentUrl } = await createFixture(
        request,
        `Z14 Drill ${label} ${Date.now()}-w${testInfo.workerIndex}`,
        baseline
      );
      await openEditor(page, bookId, chapterId, baseline);

      // --- Clean exit leg: type briefly, Escape, expect ~0s loss. ---
      await enterImmersive(page);
      const cleanMarker = `clean-exit-${Date.now()}`;
      await immersiveEditor(page).click();
      await page.keyboard.press("Control+End");
      await typeSlow(page, cleanMarker);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Immersive focus mode" })).toHaveCount(0);
      // syncImmersiveToEditor runs synchronously on exit — main editor should
      // already show the words even before the next autosave tick.
      await expect(page.locator(".ProseMirror")).toContainText(cleanMarker);
      await expect(saveStatus(page)).toContainText("Saved", { timeout: 10_000 });
      const afterClean = await getServerContent(request, contentUrl);
      expect(afterClean.markdown).toContain(cleanMarker);

      // --- Crash leg: re-enter, type for burstMs, close with ZERO settle
      //     time (worst case: killed before any scheduler timer fires). ---
      await enterImmersive(page);
      const crashMarker = `crash-${burstMs}ms-${Date.now()}`;
      await typeForMs(page, immersiveEditor(page), [crashMarker], burstMs);
      await page.close({ runBeforeUnload: false });

      const reopened = await context.newPage();
      await reopened.goto(`/books/${bookId}/chapters/${chapterId}`);
      await expect(reopened.locator(".ProseMirror")).toBeVisible({ timeout: 15_000 });
      await expect(reopened.locator(".ProseMirror")).toContainText(crashMarker, {
        timeout: 15_000,
      });
    });
  }
});

test.describe("Network-kill / crash-restart (user_qa_p2 — env-unblocked variant)", () => {
  test("dead PUT route shows Sync pending, self-heals once route restored", async ({
    page,
    request,
  }, testInfo) => {
    const baseline = `Netkill baseline ${Date.now()}-w${testInfo.workerIndex}.`;
    const { bookId, chapterId } = await createFixture(
      request,
      `Netkill Drill ${Date.now()}-w${testInfo.workerIndex}`,
      baseline
    );
    await openEditor(page, bookId, chapterId, baseline);

    await page.route("**/api/books/*/chapters/*/content", (route) => {
      if (route.request().method() === "PUT") return route.abort();
      return route.continue();
    });

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Typed against a dead route.");
    await expect(saveStatus(page)).toContainText("Sync pending", { timeout: 20_000 });

    await page.unroute("**/api/books/*/chapters/*/content");
    await expect(saveStatus(page)).toContainText("Saved", { timeout: 30_000 });
  });

  test("hard crash mid-typing recovers the draft on next load", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const baseline = `Crash baseline ${Date.now()}-w${testInfo.workerIndex}.`;
    const { bookId, chapterId } = await createFixture(
      request,
      `Crash Drill ${Date.now()}-w${testInfo.workerIndex}`,
      baseline
    );
    await openEditor(page, bookId, chapterId, baseline);

    const marker = `crash-marker-${Date.now()}`;
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(` ${marker}`);

    // No wait for "Saved" — crash immediately, before the ~2s autosave debounce
    // has any chance to land the network PUT. Recovery must come from the
    // beforeunload/pagehide IndexedDB draft path, not a completed save.
    await page.close({ runBeforeUnload: false });

    const reopened = await context.newPage();
    await reopened.goto(`/books/${bookId}/chapters/${chapterId}`);
    await expect(reopened.locator(".ProseMirror")).toBeVisible({ timeout: 15_000 });
    await expect(reopened.locator(".ProseMirror")).toContainText(marker, {
      timeout: 15_000,
    });
  });
});

test.describe("Z13 — rapid navigation / panel-toggle console hygiene", () => {
  test("rapid chapter nav and rapid focus-panel toggling produce no console errors", async ({
    page,
    request,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

    const book = await request.post("/api/books", {
      data: {
        name: `Z13 Drill ${Date.now()}-w${testInfo.workerIndex}`,
        genre: "Fantasy",
        language: "en",
      },
    });
    expect(book.ok()).toBe(true);
    const bookJson = await book.json();
    const bookId = bookJson.id as string;
    const chapter1 = bookJson.firstChapterId as string;

    const ch2 = await request.post(`/api/books/${bookId}/chapters`, {
      data: { chapterNumber: 2, title: "Z13 Ch2", actNumber: 1 },
    });
    expect(ch2.ok()).toBe(true);
    const chapter2 = (await ch2.json()).id as string;

    await page.goto(`/books/${bookId}/chapters/${chapter1}`);
    await page.waitForLoadState("networkidle");

    // Rapid back-and-forth chapter navigation — no time for the previous
    // page's async work (editor hydration, autosave setup) to settle before
    // the next navigation tears it down. Targets setState-on-unmounted and
    // unhandled-rejection classes of bug.
    for (let i = 0; i < 6; i++) {
      const target = i % 2 === 0 ? chapter2 : chapter1;
      await page.goto(`/books/${bookId}/chapters/${target}`);
      // Intentionally no networkidle wait — that's the point of "rapid".
      await page.waitForTimeout(150);
    }
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 15_000 });

    // Rapid open/close of the focus-mode options popover — mounts/unmounts a
    // portal-rendered panel repeatedly in quick succession.
    const focusBtn = page.getByRole("button", { name: "Focus mode options" });
    for (let i = 0; i < 8; i++) {
      await focusBtn.click();
      await page.waitForTimeout(80);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(80);
    }

    await page.waitForTimeout(1_000); // let any deferred async rejections surface

    // ERR_NAME_NOT_RESOLVED / Clerk-load failures are ambient noise in this
    // env (clerk.example.test is an unresolvable placeholder domain) —
    // confirmed via a control test: they fire on a single plain page load
    // with zero rapid-nav involved, so they are not a Z13 finding.
    const meaningfulErrors = errors.filter(
      (e) =>
        !/ResizeObserver loop|Non-Error promise rejection captured with keys: \[\]|ERR_NAME_NOT_RESOLVED|failed_to_load_clerk_js|Failed to load Clerk/.test(
          e
        )
    );
    expect(
      meaningfulErrors,
      `console/page errors captured:\n${meaningfulErrors.join("\n")}`
    ).toEqual([]);
  });
});
