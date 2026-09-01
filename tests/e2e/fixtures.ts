import { test as base, type APIRequestContext } from "@playwright/test";

export const test = base.extend({
  // Add custom fixtures here as needed
});

export { expect } from "@playwright/test";

/** Helper to navigate with E2E test auth bypass. */
export async function navigateAuthenticated(
  page: import("@playwright/test").Page,
  path: string
) {
  await page.goto(path);
}

// ---------------------------------------------------------------------------
// API Data Helpers — create test entities via REST endpoints
// ---------------------------------------------------------------------------

/**
 * Create a book via the API. Returns `{ id, name }`.
 * Uses the `x-e2e-test-secret` header configured in playwright.config.ts
 * for auth bypass.
 */
export async function createBookViaApi(
  request: APIRequestContext,
  data: { name: string; genre?: string; language?: string }
): Promise<{ id: string; name: string }> {
  const res = await request.post("/api/books", {
    data: {
      name: data.name,
      genre: data.genre ?? "Fantasy",
      language: data.language ?? "en",
    },
  });
  if (!res.ok()) {
    throw new Error(
      `createBookViaApi failed: ${res.status()} ${await res.text()}`
    );
  }
  const json = await res.json();
  return { id: json.id, name: json.name ?? data.name };
}

/**
 * Create a chapter via the API. Returns `{ id, chapterNumber, title }`.
 *
 * Idempotent: `POST /api/books` auto-creates a titleless placeholder Chapter 1
 * (src/app/api/books/route.ts, D-194), so a spec that creates "its" chapter 1
 * on a fresh book hits the @@unique([bookId, chapterNumber]) guard and a 409.
 * When that happens we adopt the placeholder (PATCH title) instead of failing.
 */
export async function createChapterViaApi(
  request: APIRequestContext,
  bookId: string,
  data: { chapterNumber: number; title: string; actNumber?: number }
): Promise<{ id: string; chapterNumber: number; title: string }> {
  const res = await request.post(`/api/books/${bookId}/chapters`, {
    data: {
      chapterNumber: data.chapterNumber,
      title: data.title,
      actNumber: data.actNumber ?? 1,
    },
  });
  if (!res.ok()) {
    if (res.status() === 409) {
      const existing = await request.get(`/api/books/${bookId}/chapters`);
      if (existing.ok()) {
        const list = (await existing.json()) as Array<{
          id: string;
          chapterNumber: number;
          title: string | null;
        }>;
        const match = list.find((c) => c.chapterNumber === data.chapterNumber);
        if (match) {
          const patched = await request.patch(
            `/api/books/${bookId}/chapters/${match.id}`,
            { data: { title: data.title } }
          );
          if (!patched.ok()) {
            throw new Error(
              `createChapterViaApi adopt-fallback PATCH failed: ${patched.status()} ${await patched.text()}`
            );
          }
          return { id: match.id, chapterNumber: data.chapterNumber, title: data.title };
        }
      }
    }
    throw new Error(
      `createChapterViaApi failed: ${res.status()} ${await res.text()}`
    );
  }
  const json = await res.json();
  return {
    id: json.id,
    chapterNumber: json.chapterNumber ?? data.chapterNumber,
    title: json.title ?? data.title,
  };
}

/**
 * Create an editorial finding via the API. Returns the created finding object.
 */
export async function createFindingViaApi(
  request: APIRequestContext,
  bookId: string,
  data: {
    chapterNumber: number;
    agentType: string;
    severity: string;
    category: string;
    description: string;
    originalText?: string;
    suggestedText?: string;
    suggestion?: string;
    position?: { startOffset: number; endOffset: number };
  }
): Promise<{
  id: string;
  status: string;
  severity: string;
  description: string;
}> {
  const finding: Record<string, unknown> = {
    chapterNumber: data.chapterNumber,
    agentType: data.agentType,
    severity: data.severity,
    category: data.category,
    description: data.description,
  };
  if (data.originalText) finding.originalText = data.originalText;
  // The server's create schema is `newText` (src/lib/validation.ts:371) —
  // `suggestedText` does not exist in src/ and was silently dropped, leaving
  // findings with no replacement text: auto-apply then hit the D-41a
  // destructive guard (422) and the card stayed "pending".
  if (data.suggestedText) finding.newText = data.suggestedText;
  if (data.suggestion) finding.suggestion = data.suggestion;
  if (data.position) finding.position = data.position;

  const res = await request.post(
    `/api/books/${bookId}/editorial/findings`,
    { data: { findings: [finding] } }
  );
  if (!res.ok()) {
    throw new Error(
      `createFindingViaApi failed: ${res.status()} ${await res.text()}`
    );
  }
  const json = await res.json();
  // The response returns { created: N, findings: [...] } or just { created: N }
  // We need to fetch the finding from the list endpoint
  const listRes = await request.get(
    `/api/books/${bookId}/editorial/findings?chapterNumber=${data.chapterNumber}&agentType=${data.agentType}&status=pending`
  );
  const listJson = await listRes.json();
  const found = listJson.findings?.find(
    (f: { description: string }) => f.description === data.description
  );
  if (!found) {
    throw new Error("createFindingViaApi: could not find created finding");
  }
  return found;
}
