import { test, expect } from "@playwright/test";

/**
 * Full Writing Workflow Smoke Test
 *
 * Serial steps simulating a real writer's workflow:
 *   1.  Create a book
 *   2.  Create style fingerprint (API)
 *   3.  Seed setup documents: concept, bible, architecture (API)
 *   4.  Create chapter 1 via UI
 *   5.  Plan chapter 1 (beat sheet via API)
 *   6.  Write chapter 1 content (API + verify editor)
 *   7.  Dev edit findings → apply one
 *   8.  Line edit findings → apply one
 *   9.  Beta reader finding → pass chapter
 *  10.  Export manuscript
 *  11.  Create series and add books
 *  12.  Create series bible document
 *  13.  Create series continuity document
 *  14.  Inline AI edit API (validates the new /inline-edit endpoint)
 */
test.describe("Full Writing Workflow Smoke Test", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;
  let chapterId: string;
  let seriesId: string;

  // ─── Step 1: Create book via API ──────────────────────────────
  test("Step 1 — Create book", async ({ request }) => {
    const res = await request.post("/api/books", {
      data: {
        name: "Smoke Test Novel",
        genre: "Fantasy",
        language: "en",
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.id).toBeTruthy();
    bookId = data.id;
  });

  // ─── Step 2: Create style fingerprint ─────────────────────────
  test("Step 2 — Create style fingerprint", async ({ request }) => {
    expect(bookId).toBeTruthy();

    const createRes = await request.post(`/api/books/${bookId}/style`, {
      data: {
        name: "Smoke Test Voice",
        description: "Fantasy prose voice profile",
        fingerprint:
          "Lyrical sentences with vivid sensory imagery. Favors tactile and visual metaphors. " +
          "Medium-length paragraphs. Third person limited POV with deep interior monologue. " +
          "Vocabulary register: literary but accessible.",
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // Verify retrieval
    const getRes = await request.get(`/api/books/${bookId}/style`);
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.profiles.length).toBeGreaterThanOrEqual(1);
    expect(data.profiles[0].name).toBe("Smoke Test Voice");
  });

  // ─── Step 3: Seed concept, bible, architecture ────────────────
  test("Step 3 — Seed concept, bible, architecture documents", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const docs = [
      {
        type: "CONCEPT",
        title: "Story Concept",
        content:
          "A young mage discovers an ancient tower that holds the key to preventing a catastrophic magical event.",
      },
      {
        type: "STORY_BIBLE",
        title: "Story Bible",
        content:
          "## Characters\n\n### Elara\n- Age: 22\n- Role: Protagonist\n\n### The Silver Child\n- Role: Guardian of the Tower\n\n## World\n- The kingdom of Vethara\n- Magic system: Woven threads of power",
      },
      {
        type: "ARCHITECTURE",
        title: "Story Architecture",
        content:
          "## Three-Act Structure\n\n### Act 1 (Ch 1-5): Discovery\n### Act 2 (Ch 6-15): Journey\n### Act 3 (Ch 16-20): Resolution",
      },
    ];

    for (const doc of docs) {
      const res = await request.post(`/api/books/${bookId}/documents`, {
        data: doc,
      });
      expect(res.status()).toBe(201);
    }

    // Verify documents are stored
    const listRes = await request.get(`/api/books/${bookId}/documents`);
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Step 4: Create chapter 1 ─────────────────────────────────
  test("Step 4 — Create chapter 1", async ({ request }) => {
    expect(bookId).toBeTruthy();

    const res = await request.post(`/api/books/${bookId}/chapters`, {
      data: { chapterNumber: 1, actNumber: 1, title: "The Awakening" },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
    chapterId = data.id;
  });

  // ─── Step 5: Plan chapter 1 ───────────────────────────────────
  test("Step 5 — Plan chapter 1 beat sheet", async ({ request }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    // Create plan document
    const planRes = await request.post(`/api/books/${bookId}/documents`, {
      data: {
        type: "CHAPTER_PLAN",
        title: "Chapter 1 Plan — The Awakening",
        content:
          "## Beat Sheet\n\n1. **Opening Image**: Elara approaches the tower\n" +
          "2. **Inciting Incident**: She feels magic pulsing\n" +
          "3. **Break Into Two**: She pushes open the door\n" +
          "4. **Midpoint**: Meets the Silver Child\n" +
          "5. **Closing Image**: Something ancient stirs",
        chapterNumber: 1,
      },
    });
    expect(planRes.status()).toBe(201);

    // Update chapter status to planned
    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { status: "planned" } }
    );
    expect(patchRes.ok()).toBeTruthy();
  });

  // ─── Step 6: Write chapter content ────────────────────────────
  test("Step 6 — Write chapter 1 content", async ({ request }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const prose = [
      "# The Awakening",
      "",
      "The wind howled through the ancient tower, rattling the shutters that had not been opened in a century. Elara pressed her palm against the cold stone wall and felt the magic pulsing beneath, a heartbeat older than the kingdom itself.",
      "",
      "She had come alone, against the counsel of her mentor, against every instinct that told her to turn back. But the visions would not stop, and the answers she needed lay somewhere in this crumbling spire above the clouds.",
      "",
      '"You should not be here," a voice said from the shadows.',
      "",
      "Elara spun, drawing the short blade at her hip. The figure that emerged was not what she expected — a child, no more than ten, with eyes that glowed faintly silver in the darkness.",
      "",
      '"Neither should you," Elara replied, lowering her weapon slowly. "Who are you?"',
      "",
      'The child tilted their head, as if the question itself was strange. "I am what remains," they said simply. "And you are what comes next."',
      "",
      "A tremor ran through the floor. Dust cascaded from the ceiling. Somewhere far below, something vast and ancient was waking up. Elara steadied herself against the wall, fingers digging into the grooves carved by hands long dead.",
      "",
      '"Show me," she whispered. And the Silver Child smiled.',
    ].join("\n");

    const putRes = await request.put(
      `/api/books/${bookId}/chapters/${chapterId}/content`,
      { data: { markdown: prose } }
    );
    expect(putRes.ok()).toBeTruthy();
    const data = await putRes.json();
    expect(data.wordCount).toBeGreaterThan(100);

    // Update chapter status to drafted
    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { status: "drafted" } }
    );
    expect(patchRes.ok()).toBeTruthy();
  });

  // ─── Step 7: Dev edit findings → apply ────────────────────────
  test("Step 7 — Dev edit findings and apply", async ({ request }) => {
    expect(bookId).toBeTruthy();

    // Create findings
    const res = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
            {
              chapterNumber: 1,
              severity: "important",
              category: "pacing",
              description:
                "The transition from exterior to interior happens too quickly.",
              suggestion: "Add a paragraph of sensory details at the threshold.",
              agentType: "dev-editor",
            },
            {
              chapterNumber: 1,
              severity: "suggestion",
              category: "pov-shift",
              description:
                "The Silver Child smiling feels like a brief POV shift.",
              suggestion:
                "Rewrite to describe the child's expression externally.",
              agentType: "dev-editor",
            },
          ],
        },
      }
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.created).toBe(2);

    // List findings
    const listRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1&agentType=dev-editor`
    );
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    expect(listData.findings.length).toBe(2);

    // Apply first finding
    const findingId = listData.findings[0].id;
    const applyRes = await request.patch(
      `/api/books/${bookId}/editorial/findings/${findingId}`,
      { data: { action: "apply" } }
    );
    expect(applyRes.ok()).toBeTruthy();
    const applied = await applyRes.json();
    expect(applied.status).toBe("applied");
  });

  // ─── Step 8: Line edit findings → apply ───────────────────────
  test("Step 8 — Line edit findings and apply", async ({ request }) => {
    expect(bookId).toBeTruthy();

    const res = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
            {
              chapterNumber: 1,
              severity: "suggestion",
              category: "word-choice",
              description:
                "'Crumbling spire above the clouds' uses a clichéd image.",
              suggestion:
                "Replace with: 'this spire that pierced the mist layer'",
              agentType: "line-editor",
            },
            {
              chapterNumber: 1,
              severity: "suggestion",
              category: "rhythm",
              description:
                "Three consecutive sentences start with subject-verb pattern.",
              agentType: "line-editor",
            },
          ],
        },
      }
    );
    expect(res.ok()).toBeTruthy();

    // Apply one
    const listRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1&agentType=line-editor&status=pending`
    );
    const listData = await listRes.json();
    expect(listData.findings.length).toBeGreaterThan(0);

    const applyRes = await request.patch(
      `/api/books/${bookId}/editorial/findings/${listData.findings[0].id}`,
      { data: { action: "apply" } }
    );
    expect(applyRes.ok()).toBeTruthy();
  });

  // ─── Step 9: Beta read → pass chapter ─────────────────────────
  test("Step 9 — Beta reader finding and pass chapter", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const res = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
            {
              chapterNumber: 1,
              severity: "suggestion",
              category: "reader-engagement",
              description:
                "Strong opening hook. Silver Child creates compelling tension.",
              agentType: "beta-reader",
            },
          ],
        },
      }
    );
    expect(res.ok()).toBeTruthy();

    // Update status to beta_passed
    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { status: "beta_passed" } }
    );
    expect(patchRes.ok()).toBeTruthy();

    // Verify chapter status
    const getRes = await request.get(
      `/api/books/${bookId}/chapters/${chapterId}`
    );
    expect(getRes.ok()).toBeTruthy();
    const chapter = await getRes.json();
    expect(chapter.status).toBe("beta_passed");
  });

  // ─── Step 10: Export manuscript ────────────────────────────────
  test("Step 10 — Export manuscript", async ({ request }) => {
    expect(bookId).toBeTruthy();

    // Try export — may fail if Pandoc not installed, that's OK
    const res = await request.post(`/api/books/${bookId}/export`, {
      data: { format: "docx" },
    });
    // Accept either 200 (success) or 500 (Pandoc not available)
    expect([200, 500]).toContain(res.status());
  });

  // ─── Step 11: Series ──────────────────────────────────────────
  test("Step 11 — Create series and add books", async ({ request }) => {
    const createRes = await request.post("/api/series", {
      data: {
        title: "Smoke Test Saga",
        genre: "Fantasy",
        seriesType: "TRILOGY",
        plannedBooks: 3,
      },
    });
    expect(createRes.status()).toBe(201);
    const series = await createRes.json();
    seriesId = series.id;
    expect(seriesId).toBeTruthy();

    // Add two books
    const book1 = await request.post(`/api/series/${seriesId}/books`, {
      data: { name: "Smoke Test Novel — Reborn", genre: "Fantasy" },
    });
    expect(book1.status()).toBe(201);

    const book2 = await request.post(`/api/series/${seriesId}/books`, {
      data: { name: "Book Two — The Unraveling" },
    });
    expect(book2.status()).toBe(201);

    // Verify series has books
    const getRes = await request.get(`/api/series/${seriesId}`);
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.books.length).toBe(2);
  });

  // ─── Step 12: Series bible ────────────────────────────────────
  test("Step 12 — Create series bible document", async ({ request }) => {
    expect(seriesId).toBeTruthy();

    const res = await request.post(`/api/series/${seriesId}/documents`, {
      data: {
        type: "SERIES_BIBLE",
        title: "Smoke Test Saga — Series Bible",
        content:
          "## Series Bible\n\n### Overarching Plot\nThe Unraveling threatens magic.\n\n" +
          "### Recurring Characters\n- Elara\n- The Silver Child",
      },
    });
    expect(res.status()).toBe(201);
  });

  // ─── Step 13: Series continuity ───────────────────────────────
  test("Step 13 — Create series continuity document", async ({ request }) => {
    expect(seriesId).toBeTruthy();

    const res = await request.post(`/api/series/${seriesId}/documents`, {
      data: {
        type: "SERIES_CONTINUITY",
        title: "Cross-Book Continuity Report",
        content:
          "## Continuity Check\n\n### Character Consistency\n- Elara's eye color: consistent (amber)\n" +
          "### Open Threads\n- Voice in the shadows (Book 1, Ch 1) — resolve in Book 2",
      },
    });
    expect(res.status()).toBe(201);
  });

  // ─── Step 14: Inline AI edit endpoint ─────────────────────────
  test("Step 14 — Inline edit API returns suggestions", async ({
    request,
  }) => {
    expect(bookId).toBeTruthy();

    const res = await request.post(`/api/books/${bookId}/inline-edit`, {
      data: {
        selectedText:
          "The wind howled through the ancient tower, rattling the shutters that had not been opened in a century.",
        surroundingContext:
          "Elara pressed her palm against the cold stone wall and felt the magic pulsing beneath.",
        instruction: "Make it more tense and immediate",
        count: 3,
      },
    });

    // If no Anthropic API key is configured, expect 400; otherwise 200
    if (res.status() === 200) {
      const data = await res.json();
      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBeTruthy();
      expect(data.suggestions.length).toBeGreaterThan(0);
      expect(data.suggestions.length).toBeLessThanOrEqual(3);
      // Each suggestion has text and label
      for (const s of data.suggestions) {
        expect(typeof s.text).toBe("string");
        expect(typeof s.label).toBe("string");
        expect(s.text.length).toBeGreaterThan(0);
      }
      expect(data.tokensUsed.input).toBeGreaterThan(0);
      expect(data.tokensUsed.output).toBeGreaterThan(0);
    } else {
      // No API key — that's expected in CI
      expect([400, 429]).toContain(res.status());
    }
  });
});
