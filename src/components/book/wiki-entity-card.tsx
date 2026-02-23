"use client";

import {
  UserIcon,
  MapPinIcon,
  PackageIcon,
  CalendarIcon,
  ScrollIcon,
  TagIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WikiEntity } from "@/hooks/use-wiki";

const TYPE_CONFIG: Record<string, { icon: typeof UserIcon; color: string; label: string }> = {
  character: { icon: UserIcon, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", label: "Character" },
  location:  { icon: MapPinIcon, color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20", label: "Location" },
  item:      { icon: PackageIcon, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", label: "Item" },
  event:     { icon: CalendarIcon, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20", label: "Event" },
  lore:      { icon: ScrollIcon, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", label: "Lore" },
  custom:    { icon: TagIcon, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20", label: "Custom" },
};

interface WikiEntityCardProps {
  entity: WikiEntity;
  onClick: () => void;
  typeLabels?: Record<string, string>;
}

export function WikiEntityCard({ entity, onClick, typeLabels }: WikiEntityCardProps) {
  const config = TYPE_CONFIG[entity.type] ?? TYPE_CONFIG.custom;
  const Icon = config.icon;
  const displayLabel = typeLabels?.[entity.type] ?? config.label;

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-2 ${config.color}`}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm truncate">{entity.name}</h3>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${config.color}`}>
                {displayLabel}
              </Badge>
            </div>
            {entity.aliases.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                aka {entity.aliases.join(", ")}
              </p>
            )}
            {entity.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {entity.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
