import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { estimateCost } from "@/lib/cost";
import { createLLMClient, resolveProviderRoute, resolveCheapModelFor } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";

type RouteParams = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "character";
  content: string;
}

/**
 * POST /api/books/:id/character-chat
 * Chat with a character from the book's wiki. The AI responds in-character.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await req.json();
    const { characterId, characterName, message, history = [] } = body as {
      characterId: string;
      characterName: string;
      message: string;
      history: ChatMessage[];
    };

    if (!characterName || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get book and character info
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, name: true, language: true, genre: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get character details from wiki
    let characterDescription = "";
    if (characterId) {
      const entity = await db.wikiEntity.findFirst({
        where: { id: characterId, bookId },
        select: { description: true, attributes: true },
      });
      if (entity) {
        characterDescription = entity.description ?? "";
        if (entity.attributes && typeof entity.attributes === "object") {
          const props = entity.attributes as Record<string, string>;
          if (props.personality) characterDescription += `\nPersonality: ${props.personality}`;
          if (props.background) characterDescription += `\nBackground: ${props.background}`;
          if (props.speech_pattern) characterDescription += `\nSpeech pattern: ${props.speech_pattern}`;
        }
      }
    }

    // Resolve LLM
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

    // Use the cheap tier for character chat (fast + cheap)
    const { client, model } = createLLMClient({
      modelId: cheapModel.id,
      anthropicApiKey: decryptedKeys.anthropic,
      openrouterApiKey: decryptedKeys.openrouter,
      openaiApiKey: decryptedKeys.openai,
      geminiApiKey: decryptedKeys.gemini,
      grokApiKey: decryptedKeys.grok,
    });

    const lang = book.language || "en";
    const langNote = lang !== "en"
      ? `\nIMPORTANT: Respond in ${lang}. The character speaks ${lang}.`
      : "";

    const systemPrompt = `You are ${characterName}, a character from the novel "${book.name}" (${book.genre ?? "fiction"}).${langNote}

${characterDescription ? `About you:\n${characterDescription}` : ""}

Rules:
- Stay completely in character at all times
- Respond as ${characterName} would, with their speech patterns, vocabulary, and worldview
- You can reference events and relationships from the story
- Keep responses conversational and under 200 words
- If asked something your character wouldn't know, deflect naturally in-character
- Never break the fourth wall or acknowledge being AI
- Use the character's emotional register and verbal tics`;

    // Build conversation history
    const messages = history.slice(-8).map((msg: ChatMessage) => ({
      role: msg.role === "user" ? "user" as const : "assistant" as const,
      content: msg.content,
    }));
    messages.push({ role: "user" as const, content: message });

    const response = await client.messages.create({
      model: model.modelId,
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock && "text" in textBlock ? textBlock.text : "...";

    // Record usage
    const tokensInput = response.usage.input_tokens;
    const tokensOutput = response.usage.output_tokens;
    const cost = estimateCost(model.id, tokensInput, tokensOutput);
    await db.usageRecord.create({
      data: {
        userId: user.id,
        bookId,
        agentType: "character_chat",
        model: model.id,
        tokensInput,
        tokensOutput,
        costEstimate: cost,
      },
    });

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Character Chat] Error:", message);
    return NextResponse.json(
      { error: `Character chat failed: ${message}` },
      { status: 500 }
    );
  }
}
