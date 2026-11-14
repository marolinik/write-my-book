import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * Document & Version API Tests
 *
 * Tests CRUD for documents, version history, and restore. P2-67 (Wave 7):
 * every test builds its own book and document, so one failure no longer
 * skips the tests after it.
 */

const FIRST = "First draft content.";
const SECOND = "Second draft content — revised.";

async function createDocument(request: APIRequestContext, bookId: string): Promise<string> {
  const res = await request.post(`/api/books/${bookId}/documents`, {
    data: { type: "FREEWRITE", title: "Test Freewrite", content: FIRST },
  });
  expect(res.status()).toBe(201);
  const data = await res.json();
  expect(data.id).toBeTruthy();
  return data.id as string;
}

/** A document with two versions: FIRST, then SECOND. */
async function createRevisedDocument(request: APIRequestContext, bookId: string): Promise<string> {
  const documentId = await createDocument(request, bookId);
  const res = await request.patch(`/api/books/${bookId}/documents/${documentId}`, {
    data: { content: SECOND, changeType: "manual_edit", changeSource: "manual" },
  });
  expect(res.ok()).toBeTruthy();
  return documentId;
}

test.describe("Documents API", () => {
  test("create and get a document", async ({ request, book }) => {
    const documentId = await createDocument(request, book.id);
    const res = await request.get(`/api/books/${book.id}/documents/${documentId}`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // DocumentService.read() returns { document: {...}, content: "..." }
    expect(data.content).toBe(FIRST);
    expect(data.document.currentVersion).toBe(1);
  });

  test("update document creates new version", async ({ request, book }) => {
    const documentId = await createRevisedDocument(request, book.id);
    const getRes = await request.get(`/api/books/${book.id}/documents/${documentId}`);
    const data = await getRes.json();
    expect(data.content).toBe(SECOND);
    expect(data.document.currentVersion).toBeGreaterThanOrEqual(2);
  });

  test("list versions", async ({ request, book }) => {
    const documentId = await createRevisedDocument(request, book.id);
    const res = await request.get(`/api/books/${book.id}/documents/${documentId}/versions`);
    expect(res.ok()).toBeTruthy();
    const versions = await res.json();
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  test("get specific version content", async ({ request, book }) => {
    const documentId = await createRevisedDocument(request, book.id);
    const res = await request.get(`/api/books/${book.id}/documents/${documentId}/versions/1`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.version).toBe(1);
    expect(data.content).toBe(FIRST);
  });

  test("restore old version", async ({ request, book }) => {
    const documentId = await createRevisedDocument(request, book.id);
    const res = await request.post(`/api/books/${book.id}/documents/${documentId}/restore`, {
      data: { version: 1 },
    });
    expect(res.ok()).toBeTruthy();
    const getRes = await request.get(`/api/books/${book.id}/documents/${documentId}`);
    const data = await getRes.json();
    expect(data.content).toBe(FIRST);
  });

  test("list all documents for a book", async ({ request, book }) => {
    const documentId = await createDocument(request, book.id);
    const res = await request.get(`/api/books/${book.id}/documents`);
    expect(res.ok()).toBeTruthy();
    const docs = await res.json();
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs.some((d: { id: string }) => d.id === documentId)).toBeTruthy();
  });
});
