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
import { useReportDocument } from "./use-report-document";
import { domainBadgeCounts } from "./continuity-counts";
import { categorizeContinuity } from "./continuity-domains";
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

  const { isLoading: docsLoading } = useQuery({
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

  // The live continuity net. Its rows name their domain in `type`, which is
  // the signal the six domain cards were missing (S3-22).
  const { data: flagData } = useQuery({
    queryKey: ["continuity-flags", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/continuity`);
      if (!res.ok) throw new Error("Failed to load continuity flags");
      return res.json();
    },
  });

  const isLoading = docsLoading || findingsLoading;

  // Same defect as the market tab: the list carries metadata, the prose needs
  // its own request (S3-10).
  const {
    document: continuityReport,
    content: reportContent,
    isEmpty: reportLost,
  } = useReportDocument(bookId, "CONTINUITY_REPORT");
  const flagList: Finding[] = (
    (flagData?.flags ?? (Array.isArray(flagData) ? flagData : [])) as Array<{
      id: string;
      type: string;
      severity: string;
      description: string;
      chapterNumber?: number;
    }>
  ).map((flag) => ({
    id: flag.id,
    // `type` goes where the tally reads the domain from.
    category: flag.type,
    severity: flag.severity,
    description: flag.description,
    chapterNumber: flag.chapterNumber ?? 0,
  })) as Finding[];

  const findingsList: Finding[] =
    findings?.findings ?? (Array.isArray(findings) ? findings : []);
  const allFindings: Finding[] = useMemo(
    () => [...findingsList, ...flagList],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, flagData]
  );

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

    for (const f of allFindings) {
      const domain = categorizeContinuity(f.category);
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
  }, [allFindings]);

  // Filter findings by selected domain
  const filteredFindings = useMemo(() => {
    if (!selectedDomain) return allFindings;
    return allFindings.filter(
      (f) => categorizeContinuity(f.category) === selectedDomain
    );
  }, [allFindings, selectedDomain]);

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
            {allFindings.length > 0
              ? c.findingsSummary
                  .replace("{n}", String(allFindings.length))
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
                    // Derived, not counted: the badges must add up to the total
                    // the header quotes, whatever a finding calls its severity.
                    (() => {
                      const badges = domainBadgeCounts(stats);
                      return (
                        <div className="flex items-center gap-1">
                          {badges.critical > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              {badges.critical}
                            </Badge>
                          )}
                          {badges.major > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 opacity-80">
                              {badges.major}
                            </Badge>
                          )}
                          {badges.rest > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {badges.rest}
                            </Badge>
                          )}
                        </div>
                      );
                    })()
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
              {reportLost ? t.reportTabs.reportLost : reportContent}
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
