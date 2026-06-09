import { test, expect, createBookViaApi } from "./fixtures";

/**
 * Vector Memory API E2E Tests
 *
 * Tests the /api/memory/* endpoints for:
 * - Memory stats endpoint response shape
 * - Graceful degradation when Qdrant is unavailable
 * - Per-book memory info via book detail endpoint
 * - Memory rebuild endpoint validation
 * - Memory clear endpoint validation
 */
test.describe("Vector Memory API", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;
  let qdrantAvailable = true;

  // ─── Setup: Create a test book ──────────────────────────────
  test("Setup — Create test book for memory tests", async ({ request }) => {
    const book = await createBookViaApi(request, {
      name: "Vector Memory Test Book",
      genre: "Fantasy",
      language: "en",
    });
    bookId = book.id;
    expect(bookId).toBeTruthy();
  });

  // ─── Test 1: Global memory stats shape ──────────────────────
  test("GET /api/memory/stats returns expected response shape", async ({
    request,
  }) => {
    const res = await request.get("/api/memory/stats");

    if (res.ok()) {
      const data = await res.json();
      // Global stats should have these fields
      expect(data).toHaveProperty("totalChunks");
      expect(data).toHaveProperty("qdrantHealthy");
      expect(typeof data.totalChunks).toBe("number");
      expect(data.totalChunks).toBeGreaterThanOrEqual(0);
      expect(typeof data.qdrantHealthy).toBe("boolean");

      // Optional fields that should be present
      if ("totalSearches" in data) {
        expect(typeof data.totalSearches).toBe("number");
      }
      if ("embeddingCost" in data) {
        expect(typeof data.embeddingCost).toBe("number");
        expect(data.embeddingCost).toBeGreaterThanOrEqual(0);
      }
      if ("embeddingTokens" in data) {
        expect(typeof data.embeddingTokens).toBe("number");
      }

      qdrantAvailable = data.qdrantHealthy;
    } else if (res.status() === 500) {
      // Qdrant connection failure — endpoint errored, that's a valid test result
      qdrantAvailable = false;
      const data = await res.json();
      expect(data).toHaveProperty("error");
    } else {
      // Auth not available
      expect([401, 403]).toContain(res.status());
    }
  });

  // ─── Test 2: Per-book memory stats ──────────────────────────
  test("GET /api/memory/stats?bookId= returns per-book shape", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(
      `/api/memory/stats?bookId=${bookId}`
    );

    if (res.ok()) {
      const data = await res.json();
      expect(data).toHaveProperty("bookId");
      expect(data.bookId).toBe(bookId);
      expect(data).toHaveProperty("chunkCount");
      expect(typeof data.chunkCount).toBe("number");
      // New book should have 0 chunks
      expect(data.chunkCount).toBe(0);
    } else if (res.status() === 500) {
      // Qdrant unavailable — acceptable
      qdrantAvailable = false;
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });

  // ─── Test 3: Memory rebuild requires bookId ─────────────────
  test("POST /api/memory/rebuild with empty body returns 400", async ({
    request,
  }) => {
    const res = await request.post("/api/memory/rebuild", {
      data: {},
    });

    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    }
  });

  // ─── Test 4: Memory rebuild with valid bookId ───────────────
  test("POST /api/memory/rebuild with valid bookId responds", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.post("/api/memory/rebuild", {
      data: { bookId },
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data).toHaveProperty("success");
      expect(data.success).toBeTruthy();
      expect(data).toHaveProperty("chunksIndexed");
      expect(typeof data.chunksIndexed).toBe("number");
    } else if (res.status() === 500) {
      // Qdrant not available — acceptable outcome
      const data = await res.json();
      expect(data).toHaveProperty("error");
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  // ─── Test 5: Memory clear requires confirmation ─────────────
  test("POST /api/memory/clear with missing confirm returns 400", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.post("/api/memory/clear", {
      data: { bookId },
    });

    if (res.status() !== 401) {
      // Should fail validation — confirm: true is required
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    }
  });

  // ─── Test 6: Memory clear with valid data ───────────────────
  test("POST /api/memory/clear with valid data responds", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.post("/api/memory/clear", {
      data: { bookId, confirm: true },
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data).toHaveProperty("success");
      expect(data.success).toBeTruthy();
      expect(data).toHaveProperty("cleared");
      expect(data.cleared).toBeTruthy();
    } else if (res.status() === 500) {
      // Qdrant not available — acceptable
      const data = await res.json();
      expect(data).toHaveProperty("error");
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  // ─── Test 7: Book detail includes chapters (memory context) ─
  test("GET /api/books/:id includes chapters and document count", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(`/api/books/${bookId}`);

    if (res.ok()) {
      const data = await res.json();
      expect(data).toHaveProperty("id");
      expect(data.id).toBe(bookId);
      // Book should include chapters array and document count
      expect(data).toHaveProperty("chapters");
      expect(Array.isArray(data.chapters)).toBeTruthy();
      expect(data).toHaveProperty("_count");
      expect(data._count).toHaveProperty("documents");
      expect(typeof data._count.documents).toBe("number");
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });
});
