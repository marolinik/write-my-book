import { test, expect } from "@playwright/test";

/**
 * Editorial Pipeline API Tests
 *
 * Tests findings CRUD, dismiss, undo, summary, and history.
 * These tests share state (findingId) so must run serially.
 */
test.describe("Editorial Pipeline API", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;
  let chapterId: string;
  let findingId: string;

  test.beforeAll(async ({ request }, testInfo) => {
    // Create book (unique name: serial spec, but name collisions across
    // workers/runs cascade into confusing 404s via bookId=undefined)
    const bookRes = await request.post("/api/books", {
      data: {
        name: `Editorial Test Book ${Date.now()}-w${testInfo.workerIndex}`,
        language: "en",
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const book = await bookRes.json();
    bookId = book.id;

    // Create chapter
    const chRes = await request.post(`/api/books/${bookId}/chapters`, {
      data: { chapterNumber: 1, actNumber: 1, title: "Test Chapter" },
    });
    const ch = await chRes.json();
    chapterId = ch.id;

    // Write some content
    await request.put(`/api/books/${bookId}/chapters/${chapterId}/content`, {
      data: { markdown: "# Test\n\nSome prose content for testing." },
    });
  });

  test("create findings batch", async ({ request }) => {
    const res = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
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
          ],
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.created).toBe(3);
  });

  test("list findings with filters", async ({ request }) => {
    // All findings for chapter 1
    const allRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1`
    );
    expect(allRes.ok()).toBeTruthy();
    const allData = await allRes.json();
    expect(allData.findings.length).toBe(3);

    // Filter by severity
    const majorRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1&severity=critical`
    );
    const majorData = await majorRes.json();
    expect(majorData.findings.length).toBe(1);
    expect(majorData.findings[0].severity).toBe("critical");
    findingId = majorData.findings[0].id;

    // Filter by agent type
    const lineRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1&agentType=line-editor`
    );
    const lineData = await lineRes.json();
    expect(lineData.findings.length).toBe(1);
  });

  test("apply finding", async ({ request }) => {
    const res = await request.patch(
      `/api/books/${bookId}/editorial/findings/${findingId}`,
      { data: { action: "apply" } }
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("applied");
  });

  test("undo applied finding", async ({ request }) => {
    const res = await request.post(
      `/api/books/${bookId}/editorial/findings/${findingId}/undo`
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("pending");
  });

  test("dismiss finding", async ({ request }) => {
    const res = await request.patch(
      `/api/books/${bookId}/editorial/findings/${findingId}`,
      { data: { action: "dismiss", reason: "Intentional choice" } }
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("dismissed");
  });

  test("get editorial summary", async ({ request }) => {
    const res = await request.get(
      `/api/books/${bookId}/editorial/summary`
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("total");
    expect(data.total).toBeGreaterThanOrEqual(3);
  });

  test("get edit history", async ({ request }) => {
    const res = await request.get(
      `/api/books/${bookId}/editorial/history`
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // History returns { actions: [...], total: number }
    expect(Array.isArray(data.actions)).toBeTruthy();
  });

  test("create and list dismiss patterns", async ({ request }) => {
    // Create pattern
    const createRes = await request.post(
      `/api/books/${bookId}/editorial/dismiss-pattern`,
      {
        data: {
          chapterNumber: 1,
          agentType: "dev-editor",
          patternHash: "structure:opening-hook",
          reason: "Author preference",
        },
      }
    );
    expect(createRes.ok()).toBeTruthy();

    // List patterns — response is { patterns: [...] }
    const listRes = await request.get(
      `/api/books/${bookId}/editorial/dismiss-pattern?chapterNumber=1&agentType=dev-editor`
    );
    expect(listRes.ok()).toBeTruthy();
    const data = await listRes.json();
    expect(data.patterns.length).toBeGreaterThanOrEqual(1);
  });
});
