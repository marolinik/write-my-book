import type { APIRequestContext } from "@playwright/test";
import { test, expect, createChapterViaApi } from "./fixtures";

/**
 * Editorial Pipeline API Tests
 *
 * Tests findings CRUD, dismiss, undo, summary, and history. P2-67 (Wave 7):
 * every test seeds its own book, chapter and findings, so one failure no
 * longer skips the tests after it.
 */

const FINDINGS = [
  {
    chapterNumber: 1,
    severity: "critical",
    category: "structure",
    description: "Opening needs a stronger hook.",
    suggestion: "Start in medias res.",
    agentType: "dev-editor",
  },
  {
    chapterNumber: 1,
    severity: "suggestion",
    category: "word-choice",
    description: "Overused word: 'very'.",
    agentType: "line-editor",
  },
  {
    chapterNumber: 1,
    severity: "important",
    category: "pov-consistency",
    description: "Brief POV shift in paragraph 3.",
    agentType: "dev-editor",
  },
];

/** Chapter 1 with prose and the three findings above. */
async function seedFindings(request: APIRequestContext, bookId: string): Promise<void> {
  const chapter = await createChapterViaApi(request, bookId, { chapterNumber: 1, title: "Test Chapter" });
  const content = await request.put(`/api/books/${bookId}/chapters/${chapter.id}/content`, {
    data: { markdown: "# Test\n\nSome prose content for testing." },
  });
  expect(content.ok()).toBeTruthy();
  const res = await request.post(`/api/books/${bookId}/editorial/findings`, { data: { findings: FINDINGS } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).created).toBe(3);
}

/** The id of the seeded critical finding. */
async function criticalFindingId(request: APIRequestContext, bookId: string): Promise<string> {
  const res = await request.get(`/api/books/${bookId}/editorial/findings?chapterNumber=1&severity=critical`);
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.findings.length).toBe(1);
  return data.findings[0].id as string;
}

async function act(request: APIRequestContext, bookId: string, findingId: string, data: Record<string, string>) {
  const res = await request.patch(`/api/books/${bookId}/editorial/findings/${findingId}`, { data });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe("Editorial Pipeline API", () => {
  test("create findings batch", async ({ request, book }) => {
    await seedFindings(request, book.id);
  });

  test("list findings with filters", async ({ request, book }) => {
    await seedFindings(request, book.id);

    const allRes = await request.get(`/api/books/${book.id}/editorial/findings?chapterNumber=1`);
    expect(allRes.ok()).toBeTruthy();
    expect((await allRes.json()).findings.length).toBe(3);

    const majorRes = await request.get(`/api/books/${book.id}/editorial/findings?chapterNumber=1&severity=critical`);
    const majorData = await majorRes.json();
    expect(majorData.findings.length).toBe(1);
    expect(majorData.findings[0].severity).toBe("critical");

    const lineRes = await request.get(`/api/books/${book.id}/editorial/findings?chapterNumber=1&agentType=line-editor`);
    expect((await lineRes.json()).findings.length).toBe(1);
  });

  test("apply finding", async ({ request, book }) => {
    await seedFindings(request, book.id);
    const findingId = await criticalFindingId(request, book.id);
    expect((await act(request, book.id, findingId, { action: "apply" })).status).toBe("applied");
  });

  test("undo applied finding", async ({ request, book }) => {
    await seedFindings(request, book.id);
    const findingId = await criticalFindingId(request, book.id);
    await act(request, book.id, findingId, { action: "apply" });
    const res = await request.post(`/api/books/${book.id}/editorial/findings/${findingId}/undo`);
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status).toBe("pending");
  });

  test("dismiss finding", async ({ request, book }) => {
    await seedFindings(request, book.id);
    const findingId = await criticalFindingId(request, book.id);
    const data = await act(request, book.id, findingId, { action: "dismiss", reason: "Intentional choice" });
    expect(data.status).toBe("dismissed");
  });

  test("get editorial summary", async ({ request, book }) => {
    await seedFindings(request, book.id);
    const res = await request.get(`/api/books/${book.id}/editorial/summary`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("total");
    expect(data.total).toBeGreaterThanOrEqual(3);
  });

  test("get edit history", async ({ request, book }) => {
    await seedFindings(request, book.id);
    const findingId = await criticalFindingId(request, book.id);
    await act(request, book.id, findingId, { action: "apply" });
    const res = await request.get(`/api/books/${book.id}/editorial/history`);
    expect(res.ok()).toBeTruthy();
    // History returns { actions: [...], total: number }
    expect(Array.isArray((await res.json()).actions)).toBeTruthy();
  });

  test("create and list dismiss patterns", async ({ request, book }) => {
    await seedFindings(request, book.id);
    const createRes = await request.post(`/api/books/${book.id}/editorial/dismiss-pattern`, {
      data: {
        chapterNumber: 1,
        agentType: "dev-editor",
        patternHash: "structure:opening-hook",
        reason: "Author preference",
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // List patterns — response is { patterns: [...] }
    const listRes = await request.get(
      `/api/books/${book.id}/editorial/dismiss-pattern?chapterNumber=1&agentType=dev-editor`
    );
    expect(listRes.ok()).toBeTruthy();
    expect((await listRes.json()).patterns.length).toBeGreaterThanOrEqual(1);
  });
});
