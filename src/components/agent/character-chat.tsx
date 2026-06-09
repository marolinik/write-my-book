"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  UserIcon,
  SendIcon,
  XIcon,
  SparklesIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetchJson } from "@/lib/api-client";

/**
 * PILLAR 2F: Character Chat
 * Talk to your characters — the AI embodies them based on your story bible.
 * 
 * Sudowrite users say this is the feature they "can't live without."
 * It helps writers:
 * - Find a character's voice before writing their dialogue
 * - Discover how a character would react to a situation
 * - Work through character motivation and backstory
 * - Test character consistency ("Would Elena really do that?")
 */

interface ChatMessage {
  role: "user" | "character";
  content: string;
}

interface WikiCharacter {
  id: string;
  name: string;
  description?: string;
}

interface CharacterChatProps {
  bookId: string;
  characters: WikiCharacter[];
  onClose?: () => void;
}

export function CharacterChat({ bookId, characters, onClose }: CharacterChatProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<string>(
    characters[0]?.id ?? ""
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedChar = characters.find((c) => c.id === selectedCharacter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  // Add greeting when character changes
  useEffect(() => {
    if (selectedChar) {
      setMessages([
        {
          role: "character",
          content: `*${selectedChar.name} turns to face you.* What do you want to know?`,
        },
      ]);
    }
  }, [selectedCharacter, selectedChar]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedChar || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetchJson(`/api/books/${bookId}/character-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedCharacter,
          characterName: selectedChar.name,
          message: text,
          history: messages.slice(-10), // Last 10 messages for context
        }),
      });

      setMessages((prev) => [
        ...prev,
        { role: "character", content: response.reply },
      ]);
    } catch (err) {
      toast.error("Failed to get response");
      // Remove the user message on error
      setMessages((prev) => prev.slice(0, -1));
      setInput(text); // Restore input
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, selectedChar, selectedCharacter, isLoading, messages, bookId]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            Character Chat
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
              <XIcon className="size-3" />
            </Button>
          )}
        </div>

        {/* Character selector */}
        <div className="flex gap-2 mt-2">
          <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Choose a character..." />
            </SelectTrigger>
            <SelectContent>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <UserIcon className="size-3" />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={() => setMessages([])}
          >
            <RefreshCwIcon className="size-3 mr-1" />
            Reset
          </Button>
        </div>

        {selectedChar?.description && (
          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
            {selectedChar.description}
          </p>
        )}
      </CardHeader>

      {/* Message stream */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`size-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    msg.role === "character"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {msg.role === "character" ? (selectedChar?.name?.[0] ?? "?") : "You"}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                    msg.role === "character"
                      ? "bg-muted/50 font-serif italic"
                      : "bg-primary/10"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Loader2Icon className="size-3 animate-spin text-primary" />
                </div>
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm italic text-muted-foreground">
                  *{selectedChar?.name} is thinking...*
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Input */}
      <div className="flex items-end gap-2 border-t p-3 shrink-0">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={`Talk to ${selectedChar?.name ?? "your character"}...`}
          disabled={isLoading || !selectedChar}
          rows={1}
          className="min-h-[36px] max-h-[120px] resize-none text-sm"
        />
        <Button
          size="icon"
          onClick={sendMessage}
          disabled={isLoading || !input.trim() || !selectedChar}
          className="shrink-0"
        >
          <SendIcon className="size-4" />
        </Button>
      </div>

      {/* Tips */}
      <div className="px-3 pb-2">
        <p className="text-[9px] text-muted-foreground text-center">
          Try: "How do you feel about [event]?" • "What would you do if...?" • "Tell me about your past"
        </p>
      </div>
    </Card>
  );
}
