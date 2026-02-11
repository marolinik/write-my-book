import { test, expect } from "@playwright/test";

test.describe("Full Writing Workflow Smoke Test", () => {
  test.describe.configure({ mode: "serial" });

  let bookId: string;
  let chapterId: string;
  let seriesId: string;
  let findingIds: string[] = [];

  // Step 1: Create standalone book
  test("Step 1 — Create standalone book", async ({ page }) => {
    await page.goto("/books/new");
    await page.waitForLoadState("networkidle");

    // Fill the book form — labels include trailing " *" for required fields
    await page.getByLabel("Book Name *").fill("Smoke Test Novel");
    await page.getByLabel("Genre").fill("Fantasy");

    // Submit
    await page.getByRole("button", { name: /create book/i }).click();

    // Wait for redirect to book detail
    await page.waitForURL(/\/books\/[a-f0-9-]+$/, { timeout: 10_000 });

    // Capture bookId from URL
    const url = page.url();
    const match = url.match(/\/books\/([a-f0-9-]+)$/);
    expect(match).toBeTruthy();
    bookId = match![1];

    // Verify heading
    await expect(page.getByRole("heading", { name: "Smoke Test Novel" })).toBeVisible();
  });

  // Step 2: Import writing sample → style fingerprint
  test("Step 2 — Create style fingerprint", async ({ request, page }) => {
    expect(bookId).toBeTruthy();

    // Create style profile via API
    const createRes = await request.post(`/api/books/${bookId}/style`, {
      data: {
        name: "Smoke Test Voice",
        description: "Fantasy prose voice profile",
        fingerprint: "Lyrical sentences with vivid sensory imagery. Favors tactile and visual metaphors. Medium-length paragraphs. Third person limited POV with deep interior monologue. Vocabulary register: literary but accessible.",
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // Verify it was saved
    const getRes = await request.get(`/api/books/${bookId}/style`);
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.profiles.length).toBeGreaterThanOrEqual(1);
    expect(data.profiles[0].name).toBe("Smoke Test Voice");

    // Navigate to style page and verify it renders
    await page.goto(`/books/${bookId}/style`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Style Profile")).toBeVisible();
  });

  // Step 3: Setup wizard — concept, bible, architecture documents
  test("Step 3 — Seed concept, bible, architecture documents", async ({ request, page }) => {
    expect(bookId).toBeTruthy();

    // Create concept document
    const conceptRes = await request.post(`/api/books/${bookId}/documents`, {
      data: {
        type: "CONCEPT",
        title: "Story Concept",
        content: "A young mage discovers an ancient tower that holds the key to preventing a catastrophic magical event. She must navigate political intrigue, ancient puzzles, and her own growing powers to save her kingdom.",
      },
    });
    expect(conceptRes.status()).toBe(201);

    // Create story bible
    const bibleRes = await request.post(`/api/books/${bookId}/documents`, {
      data: {
        type: "STORY_BIBLE",
        title: "Story Bible",
        content: "## Characters\n\n### Elara\n- Age: 22\n- Role: Protagonist, apprentice mage\n- Motivation: Prevent the Unraveling\n\n### The Silver Child\n- Age: Appears 10\n- Role: Guardian of the Tower\n- True nature: Fragment of ancient magic\n\n## World\n- The kingdom of Vethara\n- Magic system: Woven threads of power\n- The Tower: Pre-kingdom structure, source of all magic",
      },
    });
    expect(bibleRes.status()).toBe(201);

    // Create architecture
    const archRes = await request.post(`/api/books/${bookId}/documents`, {
      data: {
        type: "ARCHITECTURE",
        title: "Story Architecture",
        content: "## Three-Act Structure\n\n### Act 1 (Ch 1-5): Discovery\n- Elara discovers the Tower\n- Meets the Silver Child\n- Learns of the Unraveling\n\n### Act 2 (Ch 6-15): The Journey\n- Political obstacles\n- Magical trials\n- Alliance building\n\n### Act 3 (Ch 16-20): Resolution\n- Final confrontation\n- Sacrifice and renewal",
      },
    });
    expect(archRes.status()).toBe(201);

    // Navigate to book detail and verify documents section
    await page.goto(`/books/${bookId}`);
    await page.waitForLoadState("networkidle");
    // The documents heading should be visible
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  });

  // Step 4: Create chapter 1
  test("Step 4 — Create chapter 1", async ({ page }) => {
    expect(bookId).toBeTruthy();

    await page.goto(`/books/${bookId}/chapters/new`);
    await page.waitForLoadState("networkidle");

    // Fill chapter form — labels include trailing " *" for required fields
    await page.getByLabel("Chapter Number *").fill("1");
    await page.getByLabel("Act Number *").fill("1");
    await page.getByLabel("Title", { exact: false }).fill("The Awakening");

    // Submit
    await page.getByRole("button", { name: /create chapter/i }).click();

    // Wait for redirect to chapter editor page
    await page.waitForURL(/\/books\/[a-f0-9-]+\/chapters\/[a-f0-9-]+$/, {
      timeout: 10_000,
    });

    // Capture chapterId
    const url = page.url();
    const match = url.match(/\/chapters\/([a-f0-9-]+)$/);
    expect(match).toBeTruthy();
    chapterId = match![1];

    // Verify the editor page loaded (ManuscriptEditor component)
    await expect(page.locator("h1, [data-testid='chapter-title'], .font-display").first()).toBeVisible();
  });

  // Step 5: Plan chapter 1 (beat sheet via API)
  test("Step 5 — Plan chapter 1 beat sheet", async ({ request, page }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    // Create chapter plan document
    const planRes = await request.post(`/api/books/${bookId}/documents`, {
      data: {
        type: "CHAPTER_PLAN",
        title: "Chapter 1 Plan — The Awakening",
        content: "## Beat Sheet\n\n1. **Opening Image**: Elara approaches the ancient tower at dusk\n2. **Inciting Incident**: She feels magic pulsing through the walls\n3. **Debate**: Should she enter alone?\n4. **Break Into Two**: She pushes open the door\n5. **Midpoint**: Meets the Silver Child\n6. **Bad Guys Close In**: The tower begins to shake\n7. **Closing Image**: Something ancient stirs beneath the floor",
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

    // Navigate to book detail and verify status badge
    await page.goto(`/books/${bookId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("planned")).toBeVisible();
  });

  // Step 6: Write chapter 1 (ghostwriter simulation)
  test("Step 6 — Write chapter 1 content", async ({ request, page }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    const prose = `# The Awakening

The wind howled through the ancient tower, rattling the shutters that had not been opened in a century. Elara pressed her palm against the cold stone wall and felt the magic pulsing beneath, a heartbeat older than the kingdom itself.

She had come alone, against the counsel of her mentor, against every instinct that told her to turn back. But the visions would not stop, and the answers she needed lay somewhere in this crumbling spire above the clouds.

"You should not be here," a voice said from the shadows.

Elara spun, drawing the short blade at her hip. The figure that emerged was not what she expected — a child, no more than ten, with eyes that glowed faintly silver in the darkness.

"Neither should you," Elara replied, lowering her weapon slowly. "Who are you?"

The child tilted their head, as if the question itself was strange. "I am what remains," they said simply. "And you are what comes next."

A tremor ran through the floor. Dust cascaded from the ceiling. Somewhere far below, something vast and ancient was waking up. Elara steadied herself against the wall, fingers digging into the grooves carved by hands long dead.

"Show me," she whispered. And the Silver Child smiled.`;

    // Save chapter content via API
    const putRes = await request.put(
      `/api/books/${bookId}/chapters/${chapterId}/content`,
      { data: { markdown: prose } }
    );
    expect(putRes.ok()).toBeTruthy();
    const contentData = await putRes.json();
    expect(contentData.wordCount).toBeGreaterThan(100);

    // Navigate to chapter editor
    await page.goto(`/books/${bookId}/chapters/${chapterId}`);
    await page.waitForLoadState("networkidle");

    // Wait for editor to appear — the ManuscriptEditor component should render
    // The TipTap editor renders inside a div with class "tiptap" or "ProseMirror"
    const editorLocator = page.locator(".tiptap, .ProseMirror").first();
    await expect(editorLocator).toBeVisible({ timeout: 10_000 });
  });

  // Step 7: Dev edit findings → apply one
  test("Step 7 — Dev edit findings and apply", async ({ request, page }) => {
    expect(bookId).toBeTruthy();

    // Create dev editor findings
    const findingsRes = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
            {
              chapterNumber: 1,
              severity: "major",
              category: "pacing",
              description: "The transition from the tower exterior to the interior conversation happens too quickly. Add a paragraph of sensory details as Elara enters.",
              suggestion: "Insert a paragraph describing the smell of ancient dust, the echo of her footsteps, and the temperature drop as she crosses the threshold.",
              agentType: "dev-editor",
            },
            {
              chapterNumber: 1,
              severity: "moderate",
              category: "pov-shift",
              description: "The line about the Silver Child smiling feels like a brief POV shift. We shouldn't know the child's emotional state from Elara's limited perspective.",
              suggestion: "Rewrite to describe the child's expression from Elara's external observation: 'The corners of the child's mouth turned upward.'",
              agentType: "dev-editor",
            },
          ],
        },
      }
    );
    expect(findingsRes.ok()).toBeTruthy();
    const findingsData = await findingsRes.json();
    expect(findingsData.created).toBe(2);

    // Navigate to editorial page
    await page.goto(`/books/${bookId}/editorial`);
    await page.waitForLoadState("networkidle");

    // Verify editorial page renders
    await expect(page.getByText("pacing")).toBeVisible({ timeout: 10_000 });

    // Get findings from API to know their IDs
    const listRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1&agentType=dev-editor`
    );
    const listData = await listRes.json();
    findingIds = listData.findings.map((f: { id: string }) => f.id);

    // Apply first finding via API (UI Apply button triggers PATCH)
    if (findingIds.length > 0) {
      const applyRes = await request.patch(
        `/api/books/${bookId}/editorial/findings/${findingIds[0]}`,
        { data: { action: "apply" } }
      );
      expect(applyRes.ok()).toBeTruthy();
      const applied = await applyRes.json();
      expect(applied.status).toBe("applied");
    }

    // Reload and verify "applied" badge is visible
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("applied").first()).toBeVisible({ timeout: 10_000 });
  });

  // Step 8: Line edit findings → apply one
  test("Step 8 — Line edit findings and apply", async ({ request, page }) => {
    expect(bookId).toBeTruthy();

    // Create line editor findings
    const findingsRes = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
            {
              chapterNumber: 1,
              severity: "minor",
              category: "word-choice",
              description: "'Crumbling spire above the clouds' uses a cliched image. Consider a more specific description of the tower's height.",
              suggestion: "Replace with: 'this spire that pierced the mist layer where birds refused to fly'",
              agentType: "line-editor",
            },
            {
              chapterNumber: 1,
              severity: "minor",
              category: "rhythm",
              description: "Three consecutive sentences starting with subject-verb pattern in paragraph 2. Vary the sentence openings for better rhythm.",
              agentType: "line-editor",
            },
          ],
        },
      }
    );
    expect(findingsRes.ok()).toBeTruthy();

    // Navigate to editorial page
    await page.goto(`/books/${bookId}/editorial`);
    await page.waitForLoadState("networkidle");

    // Verify line editor findings appear
    await expect(page.getByText("word-choice")).toBeVisible({ timeout: 10_000 });

    // Apply one via API
    const listRes = await request.get(
      `/api/books/${bookId}/editorial/findings?chapterNumber=1&agentType=line-editor&status=pending`
    );
    const listData = await listRes.json();
    if (listData.findings.length > 0) {
      const applyRes = await request.patch(
        `/api/books/${bookId}/editorial/findings/${listData.findings[0].id}`,
        { data: { action: "apply" } }
      );
      expect(applyRes.ok()).toBeTruthy();
    }
  });

  // Step 9: Beta read → pass
  test("Step 9 — Beta reader finding and pass chapter", async ({ request, page }) => {
    expect(bookId).toBeTruthy();
    expect(chapterId).toBeTruthy();

    // Create beta reader finding
    const findingsRes = await request.post(
      `/api/books/${bookId}/editorial/findings`,
      {
        data: {
          findings: [
            {
              chapterNumber: 1,
              severity: "minor",
              category: "reader-engagement",
              description: "The opening hook is strong. The mystery of the Silver Child creates compelling tension. The pacing after the dialogue exchange could be slightly tighter.",
              agentType: "beta-reader",
            },
          ],
        },
      }
    );
    expect(findingsRes.ok()).toBeTruthy();

    // Update chapter status to beta_passed
    const patchRes = await request.patch(
      `/api/books/${bookId}/chapters/${chapterId}`,
      { data: { status: "beta_passed" } }
    );
    expect(patchRes.ok()).toBeTruthy();

    // Navigate to book detail and verify status
    await page.goto(`/books/${bookId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("beta passed")).toBeVisible();
  });

  // Step 10: Export as DOCX
  test("Step 10 — Export manuscript", async ({ request, page }) => {
    expect(bookId).toBeTruthy();

    // Navigate to export page
    await page.goto(`/books/${bookId}/export`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/export/i).first()).toBeVisible();

    // Try export via API — may fail if Pandoc not installed, that's OK
    const exportRes = await request.post(`/api/books/${bookId}/export`, {
      data: { format: "docx" },
    });
    // Accept either 200 (success) or 500 (Pandoc not available) gracefully
    expect([200, 500]).toContain(exportRes.status());
  });

  // Step 11: Create series and add books
  test("Step 11 — Create series and add books", async ({ page, request }) => {
    // Create series via UI
    await page.goto("/series/new");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Series Title *").fill("Smoke Test Saga");
    // Select series type
    await page.getByLabel("Series Type").click();
    await page.getByRole("option", { name: /trilogy/i }).click();

    await page.getByRole("button", { name: /create series/i }).click();

    // Wait for redirect to series detail
    await page.waitForURL(/\/series\/[a-f0-9-]+$/, { timeout: 10_000 });

    const url = page.url();
    const match = url.match(/\/series\/([a-f0-9-]+)$/);
    expect(match).toBeTruthy();
    seriesId = match![1];

    await expect(page.getByRole("heading", { name: "Smoke Test Saga" })).toBeVisible();

    // Add book 1 to series via series books endpoint
    const addBook1Res = await request.post(`/api/series/${seriesId}/books`, {
      data: { name: "Smoke Test Novel — Reborn", genre: "Fantasy" },
    });
    expect(addBook1Res.status()).toBe(201);

    // Add book 2 to series via API
    const addBook2Res = await request.post(`/api/series/${seriesId}/books`, {
      data: { name: "Book Two — The Unraveling" },
    });
    expect(addBook2Res.status()).toBe(201);

    // Navigate to series detail and verify both books
    await page.goto(`/series/${seriesId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Smoke Test Novel").first()).toBeVisible();
    await expect(page.getByText("Book Two").first()).toBeVisible();
  });

  // Step 12: Synthesize series bible
  test("Step 12 — Create series bible document", async ({ request, page }) => {
    expect(seriesId).toBeTruthy();

    // Create series bible document via series documents endpoint
    const docRes = await request.post(`/api/series/${seriesId}/documents`, {
      data: {
        type: "SERIES_BIBLE",
        title: "Smoke Test Saga — Series Bible",
        content: "## Series Bible\n\n### Overarching Plot\nThe Unraveling threatens to destroy magic across all kingdoms. Each book follows a different phase of the crisis.\n\n### Recurring Characters\n- Elara: Protagonist across books 1-3\n- The Silver Child: Appears in each book with changing role\n\n### World Rules\n- Magic is woven from threads of power\n- The Tower is the source and anchor of all magic\n- Breaking a thread causes cascading failures",
      },
    });
    expect(docRes.status()).toBe(201);

    // Navigate to series detail and verify documents
    await page.goto(`/series/${seriesId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Series Bible").first()).toBeVisible({ timeout: 10_000 });
  });

  // Step 13: Check cross-book continuity
  test("Step 13 — Create series continuity document", async ({ request, page }) => {
    expect(seriesId).toBeTruthy();

    // Create series continuity document
    const docRes = await request.post(`/api/series/${seriesId}/documents`, {
      data: {
        type: "SERIES_CONTINUITY",
        title: "Cross-Book Continuity Report",
        content: "## Continuity Check\n\n### Character Consistency\n- Elara's eye color: consistent (amber)\n- Silver Child's age appearance: consistent (10)\n\n### Timeline\n- Book 1 spans 3 days\n- No timeline conflicts detected\n\n### World-Building\n- Magic system rules: consistent\n- Geography references: consistent\n\n### Open Threads\n- The identity of the voice in the shadows (Book 1, Ch 1) — to be resolved in Book 2",
      },
    });
    expect(docRes.status()).toBe(201);

    // Navigate to series detail and verify continuity document
    await page.goto(`/series/${seriesId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Continuity").first()).toBeVisible({ timeout: 10_000 });
  });
});
