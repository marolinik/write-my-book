"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  ListIcon,
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
import { useLanguage } from "@/components/providers/language-provider";
import { useBook } from "@/hooks/use-books";

type DomainLabelKey =
  | "domCharacters"
  | "domTimeline"
  | "domGeography"
  | "domObjects"
  | "domRelationships"
  | "domWorld"
  | "domOther";

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
  { labelKey: DomainLabelKey; icon: React.ElementType; categories: string[] }
> = {
  characters: {
    labelKey: "domCharacters",
    icon: UsersIcon,
    categories: ["character", "characters", "character-consistency"],
  },
  timeline: {
    labelKey: "domTimeline",
    icon: ClockIcon,
    categories: ["timeline", "chronology", "time-consistency"],
  },
  geography: {
    labelKey: "domGeography",
    icon: MapPinIcon,
    categories: ["geography", "location", "setting"],
  },
  objects: {
    labelKey: "domObjects",
    icon: BoxIcon,
    categories: ["objects", "props", "items"],
  },
  relationships: {
    labelKey: "domRelationships",
    icon: HeartIcon,
    categories: ["relationships", "relationship"],
  },
  world: {
    labelKey: "domWorld",
    icon: GlobeIcon,
    categories: ["world-building", "world-rules", "worldbuilding", "magic-system"],
  },
  // Everything a domain above does not claim. Without this card, findings whose
  // category the agents chose freely (continuity, structure, plot, pacing …)
  // were counted into a bucket that was never rendered — the tracker showed
  // "0 findings" while the findings list below it was full.
  other: {
    labelKey: "domOther",
    icon: ListIcon,
    categories: [],
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
  // A bare "continuity" says nothing about WHICH domain the conflict is in, so
  // it belongs in Other. It used to be filed under World Rules, which made that
  // card look busy and the real domains look clean — the opposite of the truth.
  return "other";
}

export function ContinuityTab({ bookId }: { bookId: string }) {
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  // O10: a standalone book was told to run the SERIES continuity check — a
  // cross-book pass over books it does not have. The scope follows the book.
  const { t } = useLanguage();
  const c = t.continuityTab;
  const { data: book } = useBook(bookId);
  const inSeries = Boolean(book?.seriesId);
  const checkWorkflow = inSeries ? "check-series-continuity" : "check-continuity";
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
          <h3 className="text-lg font-semibold">{c.title}</h3>
          <p className="text-sm text-muted-foreground">{c.subtitle}</p>
        </div>
        <Button size="sm" onClick={() => openWithWorkflow(checkWorkflow)}>
          <PlayIcon className="mr-2 h-4 w-4" />
          {inSeries ? c.runSeries : c.run}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{c.tracker}</CardTitle>
          <CardDescription>
            {findingsList.length > 0
              ? c.findingsSummary
                  .replace("{n}", String(findingsList.length))
                  .replace(
                    "{d}",
                    String(
                      Object.values(domainStats).filter((st) => st.total > 0).length
                    )
                  )
              : c.trackerEmpty}
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
                    <span className="text-sm font-medium">{c[config.labelKey]}</span>
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
            <CardTitle>{c.report}</CardTitle>
            <CardDescription>{c.reportDesc}</CardDescription>
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
            <p className="text-sm text-muted-foreground">{c.reportEmpty}</p>
          </CardContent>
        </Card>
      )}

      {filteredFindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDomain
                ? c.domainFindings.replace(
                    "{domain}",
                    c[DOMAIN_CONFIG[selectedDomain]?.labelKey ?? "domOther"]
                  )
                : c.findings}
            </CardTitle>
            <CardDescription>
              {c.findingsSummary
                .replace("{n}", String(filteredFindings.length))
                .replace("{d}", String(selectedDomain ? 1 : Object.values(domainStats).filter((st) => st.total > 0).length))}
              {selectedDomain && (
                <Button
                  variant="link"
                  size="sm"
                  className="ml-2 h-auto p-0 text-xs"
                  onClick={() => setSelectedDomain(null)}
                >
                  {c.showAll}
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
                        {c.chapterShort} {finding.chapterNumber}
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
