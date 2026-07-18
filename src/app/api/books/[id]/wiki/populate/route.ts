import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { createLLMClient, resolveProviderRoute, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import type Anthropic from "@anthropic-ai/sdk";

// ─── Extraction prompt ──────────────────────────────────────────
const WIKI_EXTRACTION_PROMPT = `You are a literary wiki extraction engine. Analyze the following book documents (Story Bible, Architecture, and/or manuscript) and extract ALL entities that should appear in the book's world wiki.

Return ONLY a valid JSON array (no markdown, no code fences):

[
  {
    "type": "character|location|item|event|lore",
    "name": "Entity Name",
    "aliases": ["optional", "alternate", "names"],
    "description": "A brief description (1-3 sentences)",
    "attributes": { ... }
  }
]

Entity types and their attributes:
- character: { "role": "protagonist|antagonist|supporting|minor", "traits": "key personality traits", "arc": "character arc summary" }
- location: { "locationType": "city|building|region|country|world|other", "significance": "why this place matters" }
- item: { "itemType": "weapon|artifact|document|vehicle|clothing|tool|other", "significance": "why it matters" }
- event: { "significance": "major|minor|turning-point|climax", "timelinePosition": "when it happens" }
- lore: { "loreType": "mythology|history|custom|rule|prophecy|legend", "significance": "why it matters" }

Rules:
1. Extract ALL named characters, locations, important objects, major events, and world lore/mythology.
2. Use the EXACT names as they appear in the text.
3. Include aliases (nicknames, titles, shortened names) when present.
4. Write descriptions in the SAME LANGUAGE as the source text.
5. Do NOT invent entities not present in the text.
6. Return valid JSON only — no explanation, no markdown.`;

// ─── Type for extracted wiki entry ──────────────────────────────
interface ExtractedWikiEntry {
  type: string;
  name: string;
  aliases?: string[];
  description?: string;
  attributes?: Record<string, unknown>;
}

const VALID_TYPES = new Set(["character", "location", "item", "event", "lore"]);

// ─── Route handler ──────────────────────────────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { id: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Collect text from existing documents
  const docService = new DocumentService(user.id, bookId);
  const textParts: string[] = [];

  try {
    for (const docType of [
      DocumentType.STORY_BIBLE,
      DocumentType.ARCHITECTURE,
      DocumentType.FINGERPRINT,
    ]) {
      const doc = await docService.findByType(docType);
      if (doc) {
        const result = await docService.read(doc.id);
        if (result?.content) {
          textParts.push(`--- ${docType} ---\n${result.content}`);
        }
      }
    }

    // Also grab chapter content (first 3 chapters max to stay within token limits)
    const chapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
      take: 3,
      select: { chapterNumber: true },
    });

    for (const ch of chapters) {
      const chapterDoc = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        ch.chapterNumber
      );
      if (chapterDoc) {
        const result = await docService.read(chapterDoc.id);
        if (result?.content) {
          const truncated =
            result.content.length > 20_000
              ? result.content.slice(0, 20_000) + "\n[TRUNCATED]"
              : result.content;
          textParts.push(
            `--- CHAPTER ${ch.chapterNumber} ---\n${truncated}`
          );
        }
      }
    }
  } catch (error) {
    console.error("[wiki/populate] Document read failed:", error);
    return NextResponse.json(
      { error: "Failed to read documents. Check that S3/MinIO is running." },
      { status: 503 }
    );
  }

  if (textParts.length === 0) {
    return NextResponse.json(
      { error: "No documents found to extract from" },
      { status: 422 }
    );
  }

  const combinedText = textParts.join("\n\n");
  // Truncate to ~100K chars for token safety
  const safeText =
    combinedText.length > 100_000
      ? combinedText.slice(0, 100_000) + "\n\n[TEXT TRUNCATED]"
      : combinedText;

  // ── BYOK key resolution (no platform key fallbacks) ──────────
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { defaultModel: true },
  });
  const userDefault = dbUser?.defaultModel ?? "anthropic/sonnet";
  const cheapModel = resolveCheapModelFor(userDefault);

  const userKeys = await db.apiKey.findMany({
    where: { userId: user.id, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
  for (const k of userKeys) {
    decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
  }

  const route = resolveProviderRoute(cheapModel.provider as ProviderKey, {
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

  let llmResult: { client: Anthropic; modelId: string };
  try {
    const { client: c, model: m } = createLLMClient({
      modelId: cheapModel.id,
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });
    llmResult = { client: c, modelId: m.modelId };
  } catch (error) {
    console.error("[wiki/populate] LLM client init failed:", (error as Error).message);
    return NextResponse.json(
      { error: "Failed to initialize AI client. Check your API keys in Settings." },
      { status: 503 }
    );
  }

  const { client, modelId } = llmResult;

  let entries: ExtractedWikiEntry[] = [];
  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `${WIKI_EXTRACTION_PROMPT}\n\n${safeText}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text in response");
    }

    let cleaned = textBlock.text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected JSON array");
    }
    entries = parsed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[wiki/populate] LLM extraction failed:", msg);
    return NextResponse.json(
      { error: `Entity extraction failed: ${msg}` },
      { status: 500 }
    );
  }

  // Get existing entity names to avoid duplicates
  const existingEntities = await db.wikiEntity.findMany({
    where: { bookId },
    select: { name: true },
  });
  const existingNames = new Set(
    existingEntities.map((e) => e.name.toLowerCase())
  );

  // Create wiki entities
  let created = 0;
  for (const entry of entries) {
    if (!entry.name?.trim()) continue;
    if (!VALID_TYPES.has(entry.type)) continue;
    if (existingNames.has(entry.name.trim().toLowerCase())) continue;

    await db.wikiEntity.create({
      data: {
        bookId,
        type: entry.type,
        name: entry.name.trim(),
        aliases: Array.isArray(entry.aliases)
          ? entry.aliases.filter((a): a is string => typeof a === "string")
          : [],
        description: entry.description?.trim() ?? "",
        attributes:
          typeof entry.attributes === "object" && entry.attributes !== null
            ? (entry.attributes as Record<string, string | number | boolean>)
            : {},
        sourceType: "agent",
      },
    });
    existingNames.add(entry.name.trim().toLowerCase());
    created++;
  }

  return NextResponse.json({ created, total: entries.length });
}
