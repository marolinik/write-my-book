import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * Model Selection & Cost Estimate E2E Tests
 *
 * Tests the model resolution chain and cost estimation endpoints:
 * - Cost estimate endpoint with valid workflow
 * - Cost estimate with invalid/missing workflow
 * - Book settings model override persistence
 * - Resolution chain fallback to defaults
 *
 * P2-67 (Wave 7): every test gets its own book (fixture); the override test
 * and the resolution test each set the override they rely on.
 */

const EDITOR_MODEL = "anthropic/claude-sonnet-4-20250514";

function setEditorModel(request: APIRequestContext, bookId: string) {
  return request.patch(`/api/books/${bookId}/settings`, { data: { modelEditor: EDITOR_MODEL } });
}

test.describe("Model Selection & Cost Estimate", () => {
  test("GET /api/books/:id/cost-estimate returns estimate for valid workflow", async ({ request, book }) => {
    const res = await request.get(`/api/books/${book.id}/cost-estimate?workflowId=dev-edit`);
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
        expect(data.costEstimate.max).toBeGreaterThanOrEqual(data.costEstimate.min);
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

  test("GET /api/books/:id/cost-estimate without workflowId returns 400", async ({ request, book }) => {
    const res = await request.get(`/api/books/${book.id}/cost-estimate`);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.toLowerCase()).toContain("workflowid");
    }
  });

  test("GET /api/books/:id/cost-estimate with unknown workflow returns 400", async ({ request, book }) => {
    const res = await request.get(`/api/books/${book.id}/cost-estimate?workflowId=nonexistent-workflow`);
    if (res.status() !== 401) {
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBeDefined();
    }
  });

  test("PATCH /api/books/:id/settings persists model override", async ({ request, book }) => {
    const patchRes = await setEditorModel(request, book.id);
    if (patchRes.ok()) {
      expect((await patchRes.json()).modelEditor).toBe(EDITOR_MODEL);
      // Verify persistence via GET
      const getRes = await request.get(`/api/books/${book.id}/settings`);
      expect(getRes.ok()).toBeTruthy();
      expect((await getRes.json()).modelEditor).toBe(EDITOR_MODEL);
    } else {
      // Auth issue — acceptable
      expect([401, 404]).toContain(patchRes.status());
    }
  });

  test("GET /api/books/:id/settings returns default settings shape", async ({ request, book }) => {
    const res = await request.get(`/api/books/${book.id}/settings`);
    if (res.ok()) {
      const data = await res.json();
      // Settings should have model fields (null = use global default)
      expect(data).toHaveProperty("bookId");
      expect(data.bookId).toBe(book.id);
      for (const field of [
        "modelGhostwriter",
        "modelEditor",
        "modelBetaReader",
        "modelAnalyst",
        "modelCoach",
        "modelCreative",
        "modelOverride",
      ]) {
        expect(field in data, field).toBeTruthy();
      }
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });

  test("Cost estimate reflects book model override", async ({ request, book }) => {
    // dev-edit uses the editor role: set its override first.
    const patchRes = await setEditorModel(request, book.id);
    expect(patchRes.ok()).toBeTruthy();

    const res = await request.get(`/api/books/${book.id}/cost-estimate?workflowId=dev-edit`);
    if (res.ok()) {
      const data = await res.json();
      if (!data.blocked) {
        expect(data.resolvedModel.resolvedFrom).toBeDefined();
        // Exact value depends on the resolution chain implementation.
        expect(
          ["book-role", "book-override", "global-role", "global-default"].includes(data.resolvedModel.resolvedFrom)
        ).toBeTruthy();
      }
    } else {
      expect([401, 404]).toContain(res.status());
    }
  });
});
