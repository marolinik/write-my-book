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
  if (data.suggestedText) finding.suggestedText = data.suggestedText;
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
