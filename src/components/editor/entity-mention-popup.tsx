"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  UserIcon,
  MapPinIcon,
  SwordIcon,
  BookOpenIcon,
  XIcon,
} from "lucide-react";

/**
 * Gap 6: @mention Entity Quick-Reference Popup
 * 
 * When the author types @ in the editor, shows a searchable popup
 * listing wiki entities (characters, locations, objects, lore).
 * Selecting an entity inserts a styled mention and shows a preview card.
 * 
 * Also provides hover-to-preview on existing entity names in text.
 */

interface WikiEntity {
  id: string;
  name: string;
  type: "CHARACTER" | "LOCATION" | "OBJECT" | "LORE" | "EVENT";
  description?: string;
  aliases?: string[];
}

interface EntityMentionPopupProps {
  bookId: string;
  /** Current search query (text after @) */
  query: string;
  /** Position to render the popup */
  position: { top: number; left: number } | null;
  /** Called when entity is selected */
  onSelect: (entity: WikiEntity) => void;
  /** Called to dismiss the popup */
  onDismiss: () => void;
  visible: boolean;
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  CHARACTER: UserIcon,
  LOCATION: MapPinIcon,
  OBJECT: SwordIcon,
  LORE: BookOpenIcon,
  EVENT: BookOpenIcon,
};

const ENTITY_COLORS: Record<string, string> = {
  CHARACTER: "text-blue-500 bg-blue-500/10",
  LOCATION: "text-green-500 bg-green-500/10",
  OBJECT: "text-amber-500 bg-amber-500/10",
  LORE: "text-purple-500 bg-purple-500/10",
  EVENT: "text-pink-500 bg-pink-500/10",
};

export function EntityMentionPopup({
  bookId,
  query,
  position,
  onSelect,
  onDismiss,
  visible,
}: EntityMentionPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch entities matching query
  const { data: entities = [] } = useQuery<WikiEntity[]>({
    queryKey: ["wiki-entities", bookId, query],
    queryFn: async () => {
      const data = await fetchJson(
        `/api/books/${bookId}/wiki/search?q=${encodeURIComponent(query)}&limit=8`
      );
      return data.entities ?? [];
    },
    enabled: visible && query.length > 0,
    staleTime: 30000,
  });

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [entities]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, entities.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (entities[selectedIndex]) {
            onSelect(entities[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    };

    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [visible, entities, selectedIndex, onSelect, onDismiss]);

  if (!visible || !position || entities.length === 0) return null;

  return (
    <Card
      className="fixed z-50 w-72 shadow-xl border"
      style={{ top: position.top + 24, left: position.left }}
    >
      <CardContent className="p-0">
        <ScrollArea className="max-h-64">
          {entities.map((entity, i) => {
            const Icon = ENTITY_ICONS[entity.type] ?? BookOpenIcon;
            const color = ENTITY_COLORS[entity.type] ?? "";

            return (
              <button
                key={entity.id}
                className={`flex items-start gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedIndex ? "bg-accent" : "hover:bg-muted/50"
                }`}
                onClick={() => onSelect(entity)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className={`rounded p-1 shrink-0 ${color}`}>
                  <Icon className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-xs">{entity.name}</p>
                  {entity.description && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {entity.description}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-[8px] shrink-0">
                  {entity.type.toLowerCase()}
                </Badge>
              </button>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/**
 * Hover preview card for entity names detected in text.
 * Shows when hovering over a recognized entity name.
 */
interface EntityHoverPreviewProps {
  entity: WikiEntity | null;
  position: { top: number; left: number } | null;
}

export function EntityHoverPreview({ entity, position }: EntityHoverPreviewProps) {
  if (!entity || !position) return null;

  const Icon = ENTITY_ICONS[entity.type] ?? BookOpenIcon;
  const color = ENTITY_COLORS[entity.type] ?? "";

  return (
    <Card
      className="fixed z-50 w-64 shadow-lg"
      style={{ top: position.top - 8, left: position.left, transform: "translateY(-100%)" }}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className={`rounded p-1 ${color}`}>
            <Icon className="size-4" />
          </div>
          <div>
            <p className="font-medium text-sm">{entity.name}</p>
            <Badge variant="outline" className="text-[8px]">
              {entity.type.toLowerCase()}
            </Badge>
          </div>
        </div>
        {entity.description && (
          <p className="text-xs text-muted-foreground line-clamp-4">
            {entity.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
