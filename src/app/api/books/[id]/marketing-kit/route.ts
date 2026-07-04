import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { createLLMClient, resolveProviderRoute } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import { DocumentService } from "@/lib/documents";
import { localeFor } from "@/lib/i18n/ui-strings";

type RouteParams = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * GET /api/books/:id/marketing-kit
 * Returns the last generated marketing kit, or null if none exists.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { id: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Try to load marketingKit via raw query (field may not be in generated client yet)
  try {
    const raw = await db.$queryRaw<Array<{ marketing_kit: unknown }>>`
      SELECT marketing_kit FROM books WHERE id = ${bookId} LIMIT 1
    `;
    const kit = raw[0]?.marketing_kit;
    if (!kit) return NextResponse.json(null);
    return NextResponse.json(kit);
  } catch {
    return NextResponse.json(null);
  }
}

/**
 * POST /api/books/:id/marketing-kit
 * Generates a marketing kit from the manuscript using the user's LLM.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: {
        select: { title: true, chapterNumber: true },
        orderBy: { chapterNumber: "asc" },
        take: 5,
      },
      documents: {
        where: { type: { in: ["STORY_BIBLE", "ARCHITECTURE", "FINGERPRINT"] } },
        select: { id: true, type: true },
        take: 3,
      },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve user keys
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { defaultModel: true },
  });
  const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
  const provider = userDefault.split("/")[0] || "anthropic";
  const registryId = userDefault;

  const userKeys = await db.apiKey.findMany({
    where: { userId: user.id, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
  for (const k of userKeys) {
    decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
  }

  const route = resolveProviderRoute(provider as ProviderKey, {
    anthropicApiKey: decryptedKeys.anthropic,
    openrouterApiKey: decryptedKeys.openrouter,
    openaiApiKey: decryptedKeys.openai,
    geminiApiKey: decryptedKeys.gemini,
    grokApiKey: decryptedKeys.grok,
  });
  if (route.route === "none") {
    return NextResponse.json(
      { error: "No API key configured. Add one in Settings > API Keys." },
      { status: 400 }
    );
  }

  const { client, model } = createLLMClient({
    modelId: registryId,
    anthropicApiKey: decryptedKeys.anthropic,
    openrouterApiKey: decryptedKeys.openrouter,
    openaiApiKey: decryptedKeys.openai,
    geminiApiKey: decryptedKeys.gemini,
    grokApiKey: decryptedKeys.grok,
  });

  // Build context from stored documents. Document bodies live in S3/MinIO,
  // not in the Document table.
  const documentService = new DocumentService(user.id, bookId);
  const documentContentByType = new Map<string, string>();
  for (const doc of book.documents) {
    try {
      const read = await documentService.read(doc.id);
      documentContentByType.set(doc.type, read?.content ?? "");
    } catch (error) {
      console.warn("[Marketing Kit] Failed to read context document", doc.id, error);
      documentContentByType.set(doc.type, "");
    }
  }
  const storyBible = documentContentByType.get("STORY_BIBLE") ?? "";
  const architecture = documentContentByType.get("ARCHITECTURE") ?? "";
  const chapterList = book.chapters.map((ch) => `Ch.${ch.chapterNumber}: ${ch.title ?? "Untitled"}`).join("\n");

  const lang = book.language || "en";
  const langNote = lang !== "en" ? `\nIMPORTANT: The book is written in ${lang}. Generate the marketing materials in ${lang}, NOT English.` : "";

  const systemPrompt = `You are a publishing marketing specialist who creates compelling book marketing materials. Given information about a novel, generate a complete marketing kit.${langNote}

Rules:
- Write in the genre's appropriate tone (literary = elegant, thriller = punchy, romance = emotional)
- The blurb should hook readers without spoiling the ending
- Social posts should be engaging and include relevant hashtags
- Comparison titles should be realistic, well-known books in a similar vein
- The email should feel personal and exciting, not salesy

Respond with ONLY a JSON object matching this exact shape (no markdown fences):
{
  "logline": "One-sentence pitch (max 30 words)",
  "blurb": "Back-cover blurb (150-250 words, multiple paragraphs)",
  "storeDescription": "Amazon/store description with <b>bold</b> for emphasis (200-350 words, HTML formatting)",
  "compTitles": ["Title 1 by Author 1", "Title 2 by Author 2", "Title 3 by Author 3"],
  "socialPosts": ["Post 1 with #hashtags", "Post 2 with #hashtags", "Post 3 with #hashtags"],
  "emailAnnouncement": "Launch email body (3-4 paragraphs)"
}`;

  const userContent = `Book: "${book.name}"
Genre: ${book.genre ?? "Fiction"}
Word Count: ${book.wordCount.toLocaleString(localeFor(user.preferredLanguage ?? "en"))}
Chapters: ${book.chapterCount}
${book.description ? `Synopsis: ${book.description}` : ""}

Chapter titles:
${chapterList}

${storyBible ? `Story Bible (excerpt):\n${storyBible.slice(0, 2000)}` : ""}
${architecture ? `\nNarrative Architecture (excerpt):\n${architecture.slice(0, 1500)}` : ""}

Generate a complete marketing kit for this book.`;

  try {
    const response = await client.messages.create({
      model: model.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";

    // Parse response
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let kit;
    try {
      kit = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Add metadata
    kit.generatedAt = new Date().toISOString();

    // Save to book record via raw query (field may not be in generated client yet)
    await db.$executeRaw`
      UPDATE books SET marketing_kit = ${JSON.stringify(kit)}::jsonb WHERE id = ${bookId}
    `;

    // Record usage
    const tokensInput = response.usage.input_tokens;
    const tokensOutput = response.usage.output_tokens;
    const cost = estimateCost(model.id, tokensInput, tokensOutput);
    await db.usageRecord.create({
      data: {
        userId: user.id,
        bookId,
        agentType: "marketing_kit",
        model: model.id,
        tokensInput,
        tokensOutput,
        costEstimate: cost,
      },
    });

    return NextResponse.json(kit);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Marketing Kit] LLM error:", message);
    return NextResponse.json(
      { error: `AI generation failed: ${message}` },
      { status: 500 }
    );
  }
}
