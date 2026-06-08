"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorialStore } from "@/stores/editorial-store";

const SEVERITY_OPTIONS = ["critical", "important", "suggestion"] as const;
const CATEGORY_OPTIONS = [
  "pacing",
  "dialogue",
  "character",
  "plot",
  "voice",
  "prose",
  "clarity",
  "redundancy",
  "show-tell",
  "continuity",
  "emotion",
  "tension",
  "stakes",
  "worldbuilding",
  "crutch-phrase",
  "ai-tell",
  "sentence-variety",
  "filter-word",
  "verb-strength",
  "general",
] as const;
const STATUS_OPTIONS = ["pending", "applied", "dismissed"] as const;
const AGENT_TYPE_OPTIONS = [
  "dev-editor",
  "line-editor",
  "beta-reader",
  "continuity-checker",
] as const;

export function FindingsFilters() {
  const { filters, setFilter, resetFilters } = useEditorialStore();

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b">
      <Select
        value={filters.severity ?? "all"}
        onValueChange={(v) => setFilter("severity", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All severities</SelectItem>
          {SEVERITY_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category ?? "all"}
        onValueChange={(v) => setFilter("category", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORY_OPTIONS.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status ?? "all"}
        onValueChange={(v) => setFilter("status", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.agentType ?? "all"}
        onValueChange={(v) => setFilter("agentType", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Agent type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All agents</SelectItem>
          {AGENT_TYPE_OPTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={resetFilters}
      >
        Reset all
      </Button>
    </div>
  );
}
