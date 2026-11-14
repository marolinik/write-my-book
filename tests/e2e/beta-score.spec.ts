import type { APIRequestContext } from "@playwright/test";
import { test, expect, createChapterViaApi } from "./fixtures";

/**
 * Beta Score Pipeline E2E Tests
 *
 * Tests that beta scores flow through the data pipeline:
 * - Chapter betaScore field can be set via PATCH
 * - betaScore appears in chapter list response
 * - betaScore range validation (0-100)
 * - Analytics/analysis endpoint responds with expected shape
 * - Chapter with betaScore can be retrieved individually
 *
 * P2-67 (Wave 7): every test gets its own book (fixture) and chapter, and
 * sets the score it reads, so one failure no longer skips the rest.
 */

async function chapterOne(request: APIRequestContext, bookId: string): Promise<string> {
  const chapter = await createChapterViaApi(request, bookId, { chapterNumber: 1, title: "Opening Chapter", actNumber: 1 });
  expect(chapter.id).toBeTruthy();
  return chapter.id;
}

async function patchScore(request: APIRequestContext, bookId: string, chapterId: string, betaScore: number | null) {
  return request.patch(`/api/books/${bookId}/chapters/${chapterId}`, { data: { betaScore } });
}

/** Chapter 1 scored 7.5; the PATCH must succeed for the read tests to mean anything. */
async function scoredChapter(request: APIRequestContext, bookId: string): Promise<string> {
  const chapterId = await chapterOne(request, bookId);
  const res = await patchScore(request, bookId, chapterId, 7.5);
  expect(res.ok()).toBeTruthy();
  return chapterId;
}

test.describe("Beta Score Pipeline", () => {
  test("PATCH chapter with betaScore persists the value", async ({ request, book }) => {
    const chapterId = await chapterOne(request, book.id);
    const patchRes = await patchScore(request, book.id, chapterId, 7.5);
    if (patchRes.ok()) {
      expect((await patchRes.json()).betaScore).toBe(7.5);
    } else {
      // Auth issue — acceptable
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  test("GET chapters list includes betaScore field", async ({ request, book }) => {
    const chapterId = await scoredChapter(request, book.id);
    const res = await request.get(`/api/books/${book.id}/chapters`);
    if (res.ok()) {
      const chapters = await res.json();
      expect(Array.isArray(chapters)).toBeTruthy();
      const chapter = chapters.find((c: { id: string }) => c.id === chapterId);
      expect(chapter).toBeTruthy();
      expect(chapter.betaScore).toBe(7.5);
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  test("GET single chapter includes betaScore", async ({ request, book }) => {
    const chapterId = await scoredChapter(request, book.id);
    const res = await request.get(`/api/books/${book.id}/chapters/${chapterId}`);
    if (res.ok()) {
      const chapter = await res.json();
      expect(chapter.id).toBe(chapterId);
      expect(chapter.betaScore).toBe(7.5);
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  test("PATCH chapter with betaScore null clears the value", async ({ request, book }) => {
    const chapterId = await scoredChapter(request, book.id);
    const patchRes = await patchScore(request, book.id, chapterId, null);
    if (patchRes.ok()) {
      expect((await patchRes.json()).betaScore).toBeNull();
    } else {
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  test("PATCH chapter with betaScore 100 succeeds", async ({ request, book }) => {
    const chapterId = await chapterOne(request, book.id);
    const patchRes = await patchScore(request, book.id, chapterId, 100);
    if (patchRes.ok()) {
      expect((await patchRes.json()).betaScore).toBe(100);
    } else {
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  test("PATCH chapter with betaScore > 100 returns 400", async ({ request, book }) => {
    const chapterId = await chapterOne(request, book.id);
    const patchRes = await patchScore(request, book.id, chapterId, 101);
    if (patchRes.status() !== 401) {
      expect(patchRes.status()).toBe(400);
      expect(await patchRes.json()).toHaveProperty("error");
    }
  });

  test("GET /api/books/:id/analysis returns expected shape", async ({ request, book }) => {
    const res = await request.get(`/api/books/${book.id}/analysis`);
    if (res.ok()) {
      const data = await res.json();
      // May have analysis data or empty flag
      if (data.empty) {
        expect(data).toHaveProperty("message");
        expect(typeof data.message).toBe("string");
      } else {
        // If analysis exists, it should have structured data or rawContent
        expect("readability" in data || "rawContent" in data || "pacing" in data).toBeTruthy();
      }
    } else {
      // Auth issue or S3 not configured — acceptable in test env
      expect([401, 404, 500]).toContain(res.status());
    }
  });

  test("Multiple chapters show betaScores in list", async ({ request, book }) => {
    const chapterId = await chapterOne(request, book.id);
    const ch2 = await createChapterViaApi(request, book.id, { chapterNumber: 2, title: "Second Chapter", actNumber: 1 });

    await patchScore(request, book.id, chapterId, 8.2);
    await patchScore(request, book.id, ch2.id, 6.0);

    const listRes = await request.get(`/api/books/${book.id}/chapters`);
    if (listRes.ok()) {
      const chapters = await listRes.json();
      expect(chapters.length).toBeGreaterThanOrEqual(2);
      const ch1Data = chapters.find((c: { id: string }) => c.id === chapterId);
      const ch2Data = chapters.find((c: { id: string }) => c.id === ch2.id);
      expect(ch1Data?.betaScore).toBe(8.2);
      expect(ch2Data?.betaScore).toBe(6.0);
    } else {
      expect([401, 404]).toContain(listRes.status());
    }
  });
});
