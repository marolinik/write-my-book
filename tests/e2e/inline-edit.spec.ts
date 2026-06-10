import { test, expect } from "@playwright/test";

/**
 * Inline Edit API Tests
 *
 * Tests the /api/books/:id/inline-edit endpoint for:
 * - Successful suggestion generation (when API key is available)
 * - Validation errors (missing/invalid input)
 * - Auth enforcement
 * - Graceful handling when no API key is configured
 */
test.describe("Inline Edit API", () => {
  let bookId: string;

  test.beforeAll(async ({ request }, testInfo) => {
    // Create a test book for the inline edit tests. Name must be unique per
    // worker AND per run: beforeAll runs once per parallel worker, and book
    // names are unique per user — a fixed name 409s for every worker but one.
    const res = await request.post("/api/books", {
      data: {
        name: `Inline Edit Test Book ${Date.now()}-w${testInfo.workerIndex}`,
        genre: "Fantasy",
        language: "en",
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    bookId = data.id;
  });

  test("rejects empty selectedText", async ({ request }) => {
    const res = await request.post(`/api/books/${bookId}/inline-edit`, {
      data: {
        selectedText: "",
        count: 3,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects missing selectedText field", async ({ request }) => {
    const res = await request.post(`/api/books/${bookId}/inline-edit`, {
      data: { count: 3 },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects count > 5", async ({ request }) => {
    const res = await request.post(`/api/books/${bookId}/inline-edit`, {
      data: {
        selectedText: "Some text to rewrite.",
        count: 10,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects non-existent bookId", async ({ request }) => {
    const res = await request.post(
      "/api/books/00000000-0000-0000-0000-000000000000/inline-edit",
      {
        data: {
          selectedText: "Some text to rewrite.",
          count: 3,
        },
      }
    );
    expect([401, 404]).toContain(res.status());
  });

  test("accepts valid request (200 or 400 depending on API key)", async ({
    request,
  }) => {
    const res = await request.post(`/api/books/${bookId}/inline-edit`, {
      data: {
        selectedText:
          "She walked through the forest, feeling the leaves crunch beneath her boots.",
        instruction: "Add more sensory detail",
        count: 2,
      },
    });

    // 200 if API key configured, 400 if not
    expect([200, 400, 429]).toContain(res.status());

    if (res.status() === 200) {
      const data = await res.json();
      expect(data.suggestions.length).toBeLessThanOrEqual(2);
      for (const s of data.suggestions) {
        expect(s.text).toBeTruthy();
        expect(s.label).toBeTruthy();
      }
    }
  });

  test("works without optional fields", async ({ request }) => {
    const res = await request.post(`/api/books/${bookId}/inline-edit`, {
      data: {
        selectedText: "The door creaked open.",
      },
    });

    // Should accept the request (with defaults: count=3, no instruction, no context)
    expect([200, 400, 429]).toContain(res.status());
  });
});
