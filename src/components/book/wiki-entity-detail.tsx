"use client";

import { useState, useCallback, useEffect } from "react";
import { Trash2Icon, SaveIcon, PlusIcon, XIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import type { WikiEntity } from "@/hooks/use-wiki";

const ENTITY_TYPES = ["character", "location", "item", "event", "lore", "custom"] as const;

interface WikiStrings {
  editEntry: string;
  deleteEntry: string;
  aliases: string;
  description: string;
  attributes: string;
  source: string;
  characters: string;
  locations: string;
  items: string;
  events: string;
  lore: string;
}

interface WikiEntityDetailProps {
  entity: WikiEntity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entityId: string, data: Partial<WikiEntity>) => void;
  onDelete: (entityId: string) => void;
  isSaving?: boolean;
  strings: WikiStrings;
}

const TYPE_LABELS: Record<string, string> = {
  character: "Character",
  location: "Location",
  item: "Item",
  event: "Event",
  lore: "Lore",
  custom: "Custom",
};

export function WikiEntityDetail({
  entity,
  open,
  onOpenChange,
  onSave,
  onDelete,
  isSaving,
  strings,
}: WikiEntityDetailProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("character");
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState<Array<{ key: string; value: string }>>([]);

  // Reset form when entity changes
  useEffect(() => {
    if (entity) {
      setName(entity.name);
      setType(entity.type);
      setAliases(entity.aliases ?? []);
      setAliasInput("");
      setDescription(entity.description ?? "");
      const attrs = entity.attributes as Record<string, unknown> ?? {};
      setAttributes(
        Object.entries(attrs).map(([key, value]) => ({
          key,
          value: String(value ?? ""),
        }))
      );
    }
  }, [entity]);

  const handleSave = useCallback(() => {
    if (!entity) return;
    const attrObj: Record<string, string> = {};
    for (const a of attributes) {
      if (a.key.trim()) {
        attrObj[a.key.trim()] = a.value;
      }
    }
    onSave(entity.id, {
      name,
      type,
      aliases,
      description,
      attributes: attrObj,
    });
  }, [entity, name, type, aliases, description, attributes, onSave]);

  const handleDelete = useCallback(() => {
    if (!entity) return;
    onDelete(entity.id);
  }, [entity, onDelete]);

  const addAlias = useCallback(() => {
    const trimmed = aliasInput.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases((prev) => [...prev, trimmed]);
      setAliasInput("");
    }
  }, [aliasInput, aliases]);

  const removeAlias = useCallback((alias: string) => {
    setAliases((prev) => prev.filter((a) => a !== alias));
  }, []);

  const addAttribute = useCallback(() => {
    setAttributes((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const removeAttribute = useCallback((index: number) => {
    setAttributes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateAttribute = useCallback(
    (index: number, field: "key" | "value", val: string) => {
      setAttributes((prev) =>
        prev.map((a, i) => (i === index ? { ...a, [field]: val } : a))
      );
    },
    []
  );

  if (!entity) return null;

  const localizedTypeLabels: Record<string, string> = {
    character: strings.characters,
    location: strings.locations,
    item: strings.items,
    event: strings.events,
    lore: strings.lore,
    custom: TYPE_LABELS.custom,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{strings.editEntry}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Entity name"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {localizedTypeLabels[t] ?? TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aliases */}
          <div className="space-y-2">
            <Label>{strings.aliases}</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {aliases.map((alias) => (
                <Badge
                  key={alias}
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive/20"
                  onClick={() => removeAlias(alias)}
                >
                  {alias}
                  <XIcon className="size-3 ml-1" />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder="Add alias..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAlias();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addAlias}>
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{strings.description}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this entity..."
              rows={4}
            />
          </div>

          <Separator />

          {/* Attributes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{strings.attributes}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addAttribute}
              >
                <PlusIcon className="size-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {attributes.map((attr, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={attr.key}
                    onChange={(e) => updateAttribute(i, "key", e.target.value)}
                    placeholder="Key"
                    className="w-1/3"
                  />
                  <Input
                    value={attr.value}
                    onChange={(e) => updateAttribute(i, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeAttribute(i)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              ))}
              {attributes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No attributes yet. Add key-value pairs for custom metadata.
                </p>
              )}
            </div>
          </div>

          {/* Source */}
          <div className="text-xs text-muted-foreground">
            {strings.source}: {entity.sourceType}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash2Icon className="size-4 mr-1" />
              {strings.deleteEntry}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!name.trim() || isSaving}
            >
              <SaveIcon className="size-4 mr-1" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
