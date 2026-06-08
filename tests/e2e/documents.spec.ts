import { test, expect } from "@playwright/test";

/**
 * Document & Version API Tests
 *
 * Tests CRUD for documents, version history, and restore.
 * These tests share state (documentId) so must run serially.
 */
test.describe("Documents API", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;
  let documentId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/books", {
      data: { name: "Doc Test Book", language: "en" },
    });
    const data = await res.json();
    bookId = data.id;
  });

  test("create document", async ({ request }) => {
    const res = await request.post(`/api/books/${bookId}/documents`, {
      data: {
        type: "FREEWRITE",
        title: "Test Freewrite",
        content: "First draft content.",
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
    documentId = data.id;
  });

  test("get document", async ({ request }) => {
    const res = await request.get(
      `/api/books/${bookId}/documents/${documentId}`
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // DocumentService.read() returns { document: {...}, content: "..." }
    expect(data.content).toBe("First draft content.");
    expect(data.document.currentVersion).toBe(1);
  });

  test("update document creates new version", async ({ request }) => {
    const res = await request.patch(
      `/api/books/${bookId}/documents/${documentId}`,
      {
        data: {
          content: "Second draft content — revised.",
          changeType: "manual_edit",
          changeSource: "manual",
        },
      }
    );
    expect(res.ok()).toBeTruthy();

    // Verify version incremented
    const getRes = await request.get(
      `/api/books/${bookId}/documents/${documentId}`
    );
    const data = await getRes.json();
    expect(data.content).toBe("Second draft content — revised.");
    expect(data.document.currentVersion).toBeGreaterThanOrEqual(2);
  });

  test("list versions", async ({ request }) => {
    const res = await request.get(
      `/api/books/${bookId}/documents/${documentId}/versions`
    );
    expect(res.ok()).toBeTruthy();
    const versions = await res.json();
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  test("get specific version content", async ({ request }) => {
    const res = await request.get(
      `/api/books/${bookId}/documents/${documentId}/versions/1`
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.version).toBe(1);
    expect(data.content).toBe("First draft content.");
  });

  test("restore old version", async ({ request }) => {
    const res = await request.post(
      `/api/books/${bookId}/documents/${documentId}/restore`,
      { data: { version: 1 } }
    );
    expect(res.ok()).toBeTruthy();

    // Verify content reverted
    const getRes = await request.get(
      `/api/books/${bookId}/documents/${documentId}`
    );
    const data = await getRes.json();
    expect(data.content).toBe("First draft content.");
  });

  test("list all documents for a book", async ({ request }) => {
    const res = await request.get(`/api/books/${bookId}/documents`);
    expect(res.ok()).toBeTruthy();
    const docs = await res.json();
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(
      docs.some((d: { id: string }) => d.id === documentId)
    ).toBeTruthy();
  });
});
