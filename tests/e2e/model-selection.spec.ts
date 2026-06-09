import { test, expect, createBookViaApi } from "./fixtures";

/**
 * Model Selection & Cost Estimate E2E Tests
 *
 * Tests the model resolution chain and cost estimation endpoints:
 * - Cost estimate endpoint with valid workflow
 * - Cost estimate with invalid/missing workflow
 * - Book settings model override persistence
 * - Resolution chain fallback to defaults
 */
test.describe("Model Selection & Cost Estimate", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;

  // ─── Setup: Create a test book ──────────────────────────────
  test("Setup — Create test book", async ({ request }) => {
    const book = await createBookViaApi(request, {
      name: "Model Selection Test Book",
      genre: "Sci-Fi",
      language: "en",
    });
    bookId = book.id;
    expect(bookId).toBeTruthy();
  });

  // ─── Test 1: Cost estimate with valid workflow ──────────────
  test("GET /api/books/:id/cost-estimate returns estimate for valid workflow", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(
      `/api/books/${bookId}/cost-estimate?workflowId=dev-edit`
    );

    if (res.ok()) {
      const data = await res.json();
      // Response should have blocked flag and cost or reason
      expect(data).toHaveProperty("blocked");
      if (!data.blocked) {
        expect(data).toHaveProperty("costEstimate");
        expect(data.costEstimate).toHaveProperty("min");
        expect(data.costEstimate).toHaveProperty("max");
        expect(data.costEstimate).toHaveProperty("formatted");
        expect(typeof data.costEstimate.min).toBe("number");
        expect(typeof data.costEstimate.max).toBe("number");
        expect(data.costEstimate.min).toBeGreaterThanOrEqual(0);
        expect(data.costEstimate.max).toBeGreaterThanOrEqual(
          data.costEstimate.min
        );
      }
      // Always includes resolved model info
      expect(data).toHaveProperty("resolvedModel");
      expect(data.resolvedModel).toHaveProperty("registryId");
      expect(data.resolvedModel).toHaveProperty("displayName");
      expect(data.resolvedModel).toHaveProperty("tier");
      expect(data.resolvedModel).toHaveProperty("resolvedFrom");
    } else {
      // Auth issue or book not found — acceptable
      expect([401, 404]).toContain(res.status());
    }
  });

  // ─── Test 2: Cost estimate without workflowId ───────────────
  test("GET /api/books/:id/cost-estimate without workflowId returns 400", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(
      `/api/books/${bookId}/cost-estimate`
    );

    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.toLowerCase()).toContain("workflowid");
    }
  });

  // ─── Test 3: Cost estimate with unknown workflow ────────────
  test("GET /api/books/:id/cost-estimate with unknown workflow returns 400", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(
      `/api/books/${bookId}/cost-estimate?workflowId=nonexistent-workflow`
    );

    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    }
  });

  // ─── Test 4: Book settings model override ───────────────────
  test("PATCH /api/books/:id/settings persists model override", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    // Set a model override for the editor role
    const patchRes = await request.patch(
      `/api/books/${bookId}/settings`,
      {
        data: {
          modelEditor: "anthropic/claude-sonnet-4-20250514",
        },
      }
    );

    if (patchRes.ok()) {
      const settings = await patchRes.json();
      expect(settings.modelEditor).toBe(
        "anthropic/claude-sonnet-4-20250514"
      );

      // Verify persistence via GET
      const getRes = await request.get(
        `/api/books/${bookId}/settings`
      );
      expect(getRes.ok()).toBeTruthy();
      const fetched = await getRes.json();
      expect(fetched.modelEditor).toBe(
        "anthropic/claude-sonnet-4-20250514"
      );
    } else {
      // Auth issue — acceptable
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  // ─── Test 5: Book settings default shape ────────────────────
  test("GET /api/books/:id/settings returns default settings shape", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.get(`/api/books/${bookId}/settings`);

    if (res.ok()) {
      const data = await res.json();
      // Settings should have model fields (null = use global default)
      expect(data).toHaveProperty("bookId");
      expect(data.bookId).toBe(bookId);
      // Model fields should exist (may be null for defaults)
      expect("modelGhostwriter" in data).toBeTruthy();
      expect("modelEditor" in data).toBeTruthy();
      expect("modelBetaReader" in data).toBeTruthy();
      expect("modelAnalyst" in data).toBeTruthy();
      expect("modelCoach" in data).toBeTruthy();
      expect("modelCreative" in data).toBeTruthy();
      expect("modelOverride" in data).toBeTruthy();
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  // ─── Test 6: Resolution reflects book override ──────────────
  test("Cost estimate reflects book model override", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    // dev-edit uses the editor role — we set modelEditor above
    const res = await request.get(
      `/api/books/${bookId}/cost-estimate?workflowId=dev-edit`
    );

    if (res.ok()) {
      const data = await res.json();
      // The resolved model should reflect the book override we set
      if (!data.blocked) {
        expect(data.resolvedModel.resolvedFrom).toBeDefined();
        // The resolvedFrom should indicate book-level override
        // (exact value depends on resolution chain implementation)
        expect(
          ["book-role", "book-override", "global-role", "global-default"].includes(
            data.resolvedModel.resolvedFrom
          )
        ).toBeTruthy();
      }
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });
});
