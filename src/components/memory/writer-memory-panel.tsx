"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BrainIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  CheckIcon,
  XIcon,
  SparklesIcon,
  BookOpenIcon,
  PaletteIcon,
  AlertTriangleIcon,
  ShieldIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { fetchJson } from "@/lib/api-client";
import { toast } from "sonner";

/**
 * Gap M5: Writer Memory Panel
 * Shows what the AI remembers about the writer's preferences.
 * Writers can add, edit, and remove memories.
 * Displayed in Settings or as a sidebar panel.
 */

interface MemoryEntry {
  id: string;
  category: string;
  content: string;
  source: string;
  bookId: string | null;
  active: boolean;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  style: PaletteIcon,
  name: BookOpenIcon,
  preference: SparklesIcon,
  constraint: ShieldIcon,
  correction: AlertTriangleIcon,
  learned: BrainIcon,
};

const CATEGORY_COLORS: Record<string, string> = {
  style: "text-purple-500",
  name: "text-blue-500",
  preference: "text-green-500",
  constraint: "text-amber-500",
  correction: "text-orange-500",
  learned: "text-cyan-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  style: "Style Preference",
  name: "Name/Spelling",
  preference: "Feedback Preference",
  constraint: "Constraint",
  correction: "Correction",
  learned: "AI Learned",
};

interface WriterMemoryPanelProps {
  bookId?: string;
}

export function WriterMemoryPanel({ bookId }: WriterMemoryPanelProps) {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState("preference");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Fetch memories
  const { data: memories = [], isLoading } = useQuery<MemoryEntry[]>({
    queryKey: ["writer-memories", bookId],
    queryFn: async () => {
      const url = bookId
        ? `/api/memory?bookId=${bookId}`
        : "/api/memory";
      return fetchJson(url);
    },
  });

  // Add memory
  const addMutation = useMutation({
    mutationFn: async () => {
      return fetchJson("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          content: newContent,
          bookId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["writer-memories"] });
      setNewContent("");
      toast.success("Memory added");
    },
    onError: () => toast.error("Failed to add memory"),
  });

  // Delete memory
  const deleteMutation = useMutation({
    mutationFn: async (memoryId: string) => {
      return fetchJson(`/api/memory/${memoryId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["writer-memories"] });
      toast.success("Memory removed");
    },
  });

  // Update memory
  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      return fetchJson(`/api/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["writer-memories"] });
      setEditingId(null);
      toast.success("Memory updated");
    },
  });

  const handleAdd = () => {
    if (!newContent.trim()) return;
    addMutation.mutate();
  };

  // Group memories by category
  const grouped: Record<string, MemoryEntry[]> = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  const totalMemories = memories.length;
  const userMemories = memories.filter(m => m.source === "user").length;
  const aiMemories = memories.filter(m => m.source !== "user").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BrainIcon className="size-4" />
            Writer Memory
          </CardTitle>
          <div className="flex gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {totalMemories} total
            </Badge>
            {aiMemories > 0 && (
              <Badge variant="outline" className="text-[10px] text-cyan-500">
                {aiMemories} AI-learned
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          These preferences are injected into every AI agent session.
          The AI remembers what you tell it here.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new memory */}
        <div className="flex gap-2">
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).filter(([k]) => k !== "learned").map(([key, label]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g., Don't flag my sentence fragments"
            className="h-8 text-xs flex-1"
          />
          <Button
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={!newContent.trim() || addMutation.isPending}
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>

        {/* Memory list by category */}
        <ScrollArea className="max-h-96">
          <div className="space-y-3">
            {Object.entries(grouped).map(([category, items]) => {
              const Icon = CATEGORY_ICONS[category] ?? BrainIcon;
              const color = CATEGORY_COLORS[category] ?? "text-muted-foreground";

              return (
                <div key={category}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`size-3 ${color}`} />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {CATEGORY_LABELS[category] ?? category}
                    </span>
                  </div>
                  <div className="space-y-1 pl-4">
                    {items.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start gap-2 group text-xs"
                      >
                        {editingId === m.id ? (
                          <div className="flex gap-1 flex-1">
                            <Input
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="h-6 text-xs flex-1"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={() => updateMutation.mutate({ id: m.id, content: editContent })}
                            >
                              <CheckIcon className="size-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={() => setEditingId(null)}
                            >
                              <XIcon className="size-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-foreground">{m.content}</span>
                            {m.source !== "user" && (
                              <Badge variant="outline" className="text-[8px] shrink-0">
                                {m.source}
                              </Badge>
                            )}
                            {/*
                              D-171: this is the revoke affordance the whole
                              panel exists for, so it may not be hover-only —
                              a touch writer has no hover (D-151 family). Always
                              visible from `sm` down; the fade stays desktop
                              polish. Icon-only buttons carry aria-labels so the
                              control has a name in the a11y tree, not just a
                              glyph.
                            */}
                            <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={() => { setEditingId(m.id); setEditContent(m.content); }}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={`Edit memory: ${m.content}`}
                                title="Edit"
                              >
                                <EditIcon className="size-3" />
                              </button>
                              <button
                                onClick={() => deleteMutation.mutate(m.id)}
                                className="text-muted-foreground hover:text-destructive"
                                aria-label={`Forget memory: ${m.content}`}
                                title="Forget this"
                              >
                                <TrashIcon className="size-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {totalMemories === 0 && !isLoading && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <BrainIcon className="size-8 mx-auto mb-2 opacity-20" />
                <p>No memories yet.</p>
                <p>Add preferences that every AI agent should respect.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
