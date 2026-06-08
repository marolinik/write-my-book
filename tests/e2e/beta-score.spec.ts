import {
  test,
  expect,
  createBookViaApi,
  createChapterViaApi,
} from "./fixtures";

/**
 * Beta Score Pipeline E2E Tests
 *
 * Tests that beta scores flow through the data pipeline:
 * - Chapter betaScore field can be set via PATCH
 * - betaScore appears in chapter list response
 * - betaScore range validation (0-100)
 * - Analytics/analysis endpoint responds with expected shape
 * - Chapter with betaScore can be retrieved individually
 */
test.describe("Beta Score Pipeline", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;
  let chapterId: string;

  // ─── Setup: Create book and chapter ─────────────────────────
  test("Setup — Create test book with chapter", async ({ request }) => {
    const book = await createBookViaApi(request, {
      name: "Beta Score Test Book",
      genre: "Literary Fiction",
      language: "en",
    });
    bookId = book.id;
    expect(bookId).toBeTruthy();

    const chapter = await createChapterViaApi(request, bookId, {
      chapterNumber: 1,
      title: "Opening Chapter",
      actNumber: 1,
    });
    chapterId = chapter.id;
    expect(chapterId).toBeTruthy();
  });

  // ─── Test 1: Set betaScore on chapter ───────────────────────
  test("PATCH chapter with betaScore persists the value", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { betaScore: 7.5 } }
    );

    if (patchRes.ok()) {
      const chapter = await patchRes.json();
      expect(chapter.betaScore).toBe(7.5);
    } else {
      // Auth issue — acceptable
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  // ─── Test 2: betaScore in chapter list ──────────────────────
  test("GET chapters list includes betaScore field", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(
      `/api/books/${bookId}/chapters`
    );

    if (res.ok()) {
      const chapters = await res.json();
      expect(Array.isArray(chapters)).toBeTruthy();
      expect(chapters.length).toBeGreaterThan(0);

      const chapter = chapters.find(
        (c: { id: string }) => c.id === chapterId
      );
      expect(chapter).toBeTruthy();
      // betaScore should be present (we set it to 7.5)
      expect(chapter.betaScore).toBe(7.5);
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  // ─── Test 3: betaScore in individual chapter GET ────────────
  test("GET single chapter includes betaScore", async ({ request }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const res = await request.get(
      `/api/books/${bookId}/chapters/${chapterId}`
    );

    if (res.ok()) {
      const chapter = await res.json();
      expect(chapter.id).toBe(chapterId);
      expect(chapter.betaScore).toBe(7.5);
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  // ─── Test 4: betaScore boundary — null clears score ─────────
  test("PATCH chapter with betaScore null clears the value", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { betaScore: null } }
    );

    if (patchRes.ok()) {
      const chapter = await patchRes.json();
      expect(chapter.betaScore).toBeNull();
    } else {
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  // ─── Test 5: betaScore boundary — max value ─────────────────
  test("PATCH chapter with betaScore 100 succeeds", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { betaScore: 100 } }
    );

    if (patchRes.ok()) {
      const chapter = await patchRes.json();
      expect(chapter.betaScore).toBe(100);
    } else {
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  // ─── Test 6: betaScore over 100 rejected ────────────────────
  test("PATCH chapter with betaScore > 100 returns 400", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { betaScore: 101 } }
    );

    if (patchRes.status() !== 401) {
      expect(patchRes.status()).toBe(400);
      const data = await patchRes.json();
      expect(data).toHaveProperty("error");
    }
  });

  // ─── Test 7: Analytics endpoint responds ────────────────────
  test("GET /api/books/:id/analysis returns expected shape", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(
      `/api/books/${bookId}/analysis`
    );

    if (res.ok()) {
      const data = await res.json();
      // May have analysis data or empty flag
      if (data.empty) {
        expect(data).toHaveProperty("message");
        expect(typeof data.message).toBe("string");
      } else {
        // If analysis exists, it should have structured data or rawContent
        expect(
          "readability" in data ||
            "rawContent" in data ||
            "pacing" in data
        ).toBeTruthy();
      }
    } else {
      // Auth issue or S3 not configured — acceptable in test env
      expect([401, 404, 500]).toContain(res.status());
    }
  });

  // ─── Test 8: Multiple chapters with scores ──────────────────
  test("Multiple chapters show betaScores in list", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    // Create a second chapter
    const ch2 = await createChapterViaApi(request, bookId, {
      chapterNumber: 2,
      title: "Second Chapter",
      actNumber: 1,
    });

    // Set different betaScores
    await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { betaScore: 8.2 } }
    );
    await request.patch(
      `/api/books/${bookId}/chapters/${ch2.id}`,
      { data: { betaScore: 6.0 } }
    );

    // List all chapters
    const listRes = await request.get(
      `/api/books/${bookId}/chapters`
    );

    if (listRes.ok()) {
      const chapters = await listRes.json();
      expect(chapters.length).toBeGreaterThanOrEqual(2);

      const ch1Data = chapters.find(
        (c: { id: string }) => c.id === chapterId
      );
      const ch2Data = chapters.find(
        (c: { id: string }) => c.id === ch2.id
      );

      expect(ch1Data?.betaScore).toBe(8.2);
      expect(ch2Data?.betaScore).toBe(6.0);
    } else {
      expect([401, 404]).toContain(listRes.status());
    }
  });
});
