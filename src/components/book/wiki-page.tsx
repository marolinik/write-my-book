"use client";

import { useState, useCallback, useMemo } from "react";
import {
  SearchIcon,
  PlusIcon,
  BookOpenIcon,
  SparklesIcon,
  Loader2Icon,
  CheckCircleIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getUIStrings } from "@/lib/i18n/ui-strings";
import {
  useWikiEntities,
  useCreateWikiEntity,
  useUpdateWikiEntity,
  useDeleteWikiEntity,
  usePopulateWiki,
} from "@/hooks/use-wiki";
import type { WikiEntity } from "@/hooks/use-wiki";
import { WikiEntityCard } from "./wiki-entity-card";
import { WikiEntityDetail } from "./wiki-entity-detail";

const TABS = ["all", "character", "location", "item", "event", "lore"] as const;

interface WikiPageProps {
  bookId: string;
  language: string;
}

export function WikiPage({ bookId, language }: WikiPageProps) {
  const t = getUIStrings(language);
  const w = t.wiki;

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<WikiEntity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [populateResult, setPopulateResult] = useState<number | null>(null);

  // Use debounced search for API calls
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
      searchTimeoutRef[0] = setTimeout(() => {
        setDebouncedSearch(value);
      }, 300);
    },
    [searchTimeoutRef]
  );

  const { data: entities = [], isLoading } = useWikiEntities(
    bookId,
    activeTab,
    debouncedSearch
  );

  const createMutation = useCreateWikiEntity(bookId);
  const updateMutation = useUpdateWikiEntity(bookId);
  const deleteMutation = useDeleteWikiEntity(bookId);
  const populateMutation = usePopulateWiki(bookId);

  const handleCreate = useCallback(() => {
    createMutation.mutate(
      {
        type: activeTab === "all" ? "character" : activeTab,
        name: "New Entry",
        description: "",
        aliases: [],
        attributes: {},
        sourceType: "manual",
      },
      {
        onSuccess: (newEntity: WikiEntity) => {
          setSelectedEntity(newEntity);
          setDetailOpen(true);
        },
      }
    );
  }, [createMutation, activeTab]);

  const handlePopulate = useCallback(() => {
    setPopulateResult(null);
    populateMutation.mutate(undefined, {
      onSuccess: (data) => {
        setPopulateResult(data.created);
        // Clear after 5s
        setTimeout(() => setPopulateResult(null), 5000);
      },
    });
  }, [populateMutation]);

  const handleSave = useCallback(
    (entityId: string, data: Partial<WikiEntity>) => {
      updateMutation.mutate(
        { entityId, data },
        {
          onSuccess: (updated: WikiEntity) => {
            setSelectedEntity(updated);
            setDetailOpen(false);
          },
        }
      );
    },
    [updateMutation]
  );

  const handleDelete = useCallback(
    (entityId: string) => {
      deleteMutation.mutate(entityId, {
        onSuccess: () => {
          setSelectedEntity(null);
          setDetailOpen(false);
        },
      });
    },
    [deleteMutation]
  );

  const handleCardClick = useCallback((entity: WikiEntity) => {
    setSelectedEntity(entity);
    setDetailOpen(true);
  }, []);

  const tabLabels: Record<string, string> = useMemo(
    () => ({
      all: w.all,
      character: w.characters,
      location: w.locations,
      item: w.items,
      event: w.events,
      lore: w.lore,
    }),
    [w]
  );

  const typeLabels: Record<string, string> = useMemo(
    () => ({
      character: w.characters,
      location: w.locations,
      item: w.items,
      event: w.events,
      lore: w.lore,
    }),
    [w]
  );

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">{w.title}</h1>
        <div className="flex items-center gap-2">
          {/* Populate result badge */}
          {populateResult !== null && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircleIcon className="size-3.5" />
              {populateResult} {w.populated}
            </span>
          )}

          {/* Populate from documents */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePopulate}
            disabled={populateMutation.isPending}
          >
            {populateMutation.isPending ? (
              <Loader2Icon className="size-4 mr-1 animate-spin" />
            ) : (
              <SparklesIcon className="size-4 mr-1" />
            )}
            {populateMutation.isPending ? w.populating : w.populate}
          </Button>

          <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
            <PlusIcon className="size-4 mr-1" />
            {w.newEntry}
          </Button>
        </div>
      </div>

      {/* Search + Tabs */}
      <div className="space-y-4 mb-6">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={w.search}
            className="pl-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {tabLabels[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpenIcon className="size-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-lg">{w.noEntries}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {w.noEntriesDesc}
          </p>
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="outline"
              onClick={handlePopulate}
              disabled={populateMutation.isPending}
            >
              {populateMutation.isPending ? (
                <Loader2Icon className="size-4 mr-1 animate-spin" />
              ) : (
                <SparklesIcon className="size-4 mr-1" />
              )}
              {populateMutation.isPending ? w.populating : w.populate}
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              <PlusIcon className="size-4 mr-1" />
              {w.newEntry}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <WikiEntityCard
              key={entity.id}
              entity={entity}
              onClick={() => handleCardClick(entity)}
              typeLabels={typeLabels}
            />
          ))}
        </div>
      )}

      {/* Populate error */}
      {populateMutation.isError && (
        <p className="text-sm text-destructive mt-2">
          {populateMutation.error?.message}
        </p>
      )}

      {/* Detail Sheet */}
      <WikiEntityDetail
        entity={selectedEntity}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={handleSave}
        onDelete={handleDelete}
        isSaving={updateMutation.isPending}
        strings={w}
      />
    </div>
  );
}
