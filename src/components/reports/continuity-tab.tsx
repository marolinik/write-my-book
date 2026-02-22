"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  PlayIcon,
  UsersIcon,
  ClockIcon,
  MapPinIcon,
  BoxIcon,
  HeartIcon,
  GlobeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAgentUIStore } from "@/stores/agent-ui-store";

interface Finding {
  id: string;
  severity: string;
  category: string;
  description: string;
  title?: string;
  chapterNumber?: number;
}

const DOMAIN_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; categories: string[] }
> = {
  characters: {
    label: "Characters",
    icon: UsersIcon,
    categories: ["character", "characters", "character-consistency"],
  },
  timeline: {
    label: "Timeline",
    icon: ClockIcon,
    categories: ["timeline", "chronology", "time-consistency"],
  },
  geography: {
    label: "Geography",
    icon: MapPinIcon,
    categories: ["geography", "location", "setting"],
  },
  objects: {
    label: "Objects & Props",
    icon: BoxIcon,
    categories: ["objects", "props", "items"],
  },
  relationships: {
    label: "Relationships",
    icon: HeartIcon,
    categories: ["relationships", "relationship"],
  },
  world: {
    label: "World Rules",
    icon: GlobeIcon,
    categories: ["world-building", "world-rules", "magic-system"],
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "destructive",
  major: "destructive",
  minor: "secondary",
  suggestion: "outline",
};

function categorizeFinding(category: string): string {
  const lower = category.toLowerCase();
  for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
    if (config.categories.some((c) => lower.includes(c))) return domain;
  }
  // Default: if it contains "continuity" or doesn't match, assign to general
  if (lower.includes("continuity")) return "world";
  return "other";
}

export function ContinuityTab({ bookId }: { bookId: string }) {
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: findings, isLoading: findingsLoading } = useQuery({
    queryKey: ["continuity-findings", bookId],
    queryFn: async () => {
      const res = await fetch(
        `/api/books/${bookId}/editorial/findings?category=continuity`
      );
      if (!res.ok) throw new Error("Failed to load findings");
      return res.json();
    },
  });

  const isLoading = docsLoading || findingsLoading;

  const docs = Array.isArray(documents)
    ? documents
    : (documents?.documents ?? []);
  const continuityReport = docs.find(
    (d: Record<string, unknown>) => d.type === "CONTINUITY_REPORT"
  );
  const findingsList: Finding[] =
    findings?.findings ?? (Array.isArray(findings) ? findings : []);

  // Compute domain counts from actual findings
  const domainStats = useMemo(() => {
    const stats: Record<
      string,
      { total: number; critical: number; major: number; minor: number; suggestion: number }
    > = {};

    for (const domain of Object.keys(DOMAIN_CONFIG)) {
      stats[domain] = { total: 0, critical: 0, major: 0, minor: 0, suggestion: 0 };
    }
    stats["other"] = { total: 0, critical: 0, major: 0, minor: 0, suggestion: 0 };

    for (const f of findingsList) {
      const domain = categorizeFinding(f.category);
      if (!stats[domain]) {
        stats[domain] = { total: 0, critical: 0, major: 0, minor: 0, suggestion: 0 };
      }
      stats[domain].total++;
      const sev = f.severity as keyof typeof stats[string];
      if (sev in stats[domain]) {
        (stats[domain] as Record<string, number>)[sev]++;
      }
    }

    return stats;
  }, [findingsList]);

  // Filter findings by selected domain
  const filteredFindings = useMemo(() => {
    if (!selectedDomain) return findingsList;
    return findingsList.filter(
      (f) => categorizeFinding(f.category) === selectedDomain
    );
  }, [findingsList, selectedDomain]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Continuity</h3>
          <p className="text-sm text-muted-foreground">
            Track consistency across your manuscript
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => openWithWorkflow("check-series-continuity")}
        >
          <PlayIcon className="mr-2 h-4 w-4" />
          Run Continuity Check
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Continuity Tracker</CardTitle>
          <CardDescription>
            {findingsList.length > 0
              ? `${findingsList.length} finding${findingsList.length !== 1 ? "s" : ""} across ${Object.values(domainStats).filter((s) => s.total > 0).length} domains`
              : "No findings yet — run a continuity check to populate"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(DOMAIN_CONFIG).map(([key, config]) => {
              const stats = domainStats[key];
              const Icon = config.icon;
              const isSelected = selectedDomain === key;
              const hasFindings = stats.total > 0;

              return (
                <button
                  key={key}
                  onClick={() =>
                    setSelectedDomain(isSelected ? null : key)
                  }
                  className={cn(
                    "flex items-center justify-between rounded-md border p-3 text-left transition-colors",
                    isSelected && "border-primary bg-primary/5",
                    hasFindings && !isSelected && "hover:border-primary/50",
                    !hasFindings && "opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                  {hasFindings ? (
                    <div className="flex items-center gap-1">
                      {stats.critical > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {stats.critical}
                        </Badge>
                      )}
                      {stats.major > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 opacity-80">
                          {stats.major}
                        </Badge>
                      )}
                      {(stats.minor > 0 || stats.suggestion > 0) && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {stats.minor + stats.suggestion}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      —
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {continuityReport ? (
        <Card>
          <CardHeader>
            <CardTitle>Continuity Report</CardTitle>
            <CardDescription>
              Generated by the continuity check agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
              {continuityReport.rawContent ??
                continuityReport.content ??
                "No content available."}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No continuity report yet. Click &quot;Run Continuity Check&quot;
              to generate one.
            </p>
          </CardContent>
        </Card>
      )}

      {filteredFindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDomain
                ? `${DOMAIN_CONFIG[selectedDomain]?.label ?? "Other"} Findings`
                : "Continuity Findings"}
            </CardTitle>
            <CardDescription>
              {filteredFindings.length} finding
              {filteredFindings.length !== 1 ? "s" : ""}
              {selectedDomain && (
                <Button
                  variant="link"
                  size="sm"
                  className="ml-2 h-auto p-0 text-xs"
                  onClick={() => setSelectedDomain(null)}
                >
                  Show all
                </Button>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {finding.title || finding.description}
                    </p>
                    {finding.title && finding.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {finding.description}
                      </p>
                    )}
                    {finding.chapterNumber && (
                      <span className="text-xs text-muted-foreground">
                        Ch. {finding.chapterNumber}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant={
                      (SEVERITY_COLORS[finding.severity] as "destructive" | "secondary" | "outline") ??
                      "outline"
                    }
                    className="ml-2 shrink-0"
                  >
                    {finding.severity ?? "info"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
