"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useBookInsights,
  useDismissInsight,
  useInsightCount,
} from "@/hooks/use-insights";
import type { InsightItem } from "@/hooks/use-insights";
import {
  AlertTriangle,
  Lightbulb,
  Flag,
  Lock,
  ChevronDown,
  ChevronRight,
  X,
  Clipboard,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────

function insightTypeIcon(type: string) {
  switch (type) {
    case "WARNING":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "SUGGESTION":
      return <Lightbulb className="h-4 w-4 text-blue-500" />;
    case "FLAG":
      return <Flag className="h-4 w-4 text-red-500" />;
    case "CONSTRAINT":
      return <Lock className="h-4 w-4 text-purple-500" />;
    default:
      return <Clipboard className="h-4 w-4 text-muted-foreground" />;
  }
}

function insightTypeBadge(type: string) {
  switch (type) {
    case "WARNING":
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          warning
        </Badge>
      );
    case "SUGGESTION":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          suggestion
        </Badge>
      );
    case "FLAG":
      return <Badge variant="destructive">flag</Badge>;
    case "CONSTRAINT":
      return (
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
          constraint
        </Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
}

function domainBadge(domain: string) {
  return (
    <Badge variant="outline" className="text-xs">
      {domain}
    </Badge>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ─── Insight Card ────────────────────────────────────────────────

function InsightCard({
  insight,
  bookId,
}: {
  insight: InsightItem;
  bookId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const dismissMutation = useDismissInsight(bookId);

  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="p-3 space-y-2">
        {/* Top row: type icon + type badge + domain badge + time */}
        <div className="flex items-center gap-2 flex-wrap">
          {insightTypeIcon(insight.insightType)}
          {insightTypeBadge(insight.insightType)}
          {domainBadge(insight.domain)}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatRelativeTime(insight.createdAt)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm font-medium">{insight.summary}</p>

        {/* Source agent */}
        <p className="text-xs text-muted-foreground">
          from <span className="font-medium">{insight.sourceAgentType}</span>
          {insight.chapterScope.length > 0 && (
            <span>
              {" "}
              &middot; Ch. {insight.chapterScope.join(", ")}
            </span>
          )}
        </p>

        {/* Expandable detail */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-0 text-xs text-muted-foreground gap-1"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {expanded ? "Hide detail" : "Show detail"}
          </Button>
          {expanded && (
            <p className="mt-1 rounded bg-muted p-2 text-xs whitespace-pre-wrap">
              {insight.detail}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <div className="flex items-center pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={dismissMutation.isPending}
            onClick={() => dismissMutation.mutate(insight.id)}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Domain Group ────────────────────────────────────────────────

function DomainGroup({
  domain,
  insights,
  bookId,
}: {
  domain: string;
  insights: InsightItem[];
  bookId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="space-y-2">
      <button
        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 w-full text-left"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        <span className="capitalize">{domain}</span>
        <Badge variant="secondary" className="text-xs ml-1">
          {insights.length}
        </Badge>
      </button>
      {!collapsed && (
        <div className="space-y-2 pl-6">
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              bookId={bookId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────

export function BlackboardPanel({ bookId }: { bookId: string }) {
  const { data, isLoading, error } = useBookInsights(bookId, {
    status: "active",
  });
  const count = useInsightCount(bookId);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading insights...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        Failed to load insights: {(error as Error).message}
      </div>
    );
  }

  const insights = data?.insights ?? [];

  if (insights.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No active insights on the blackboard. Insights appear here when agents
        flag important cross-cutting concerns for other agents to consider.
      </div>
    );
  }

  // Group insights by domain
  const grouped = new Map<string, InsightItem[]>();
  for (const insight of insights) {
    const existing = grouped.get(insight.domain) ?? [];
    existing.push(insight);
    grouped.set(insight.domain, existing);
  }

  // Sort domains alphabetically
  const sortedDomains = [...grouped.keys()].sort();

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Blackboard
        </h3>
        <Badge variant="secondary">{count} active</Badge>
      </div>

      {/* Domain groups */}
      <div className="space-y-4">
        {sortedDomains.map((domain) => (
          <DomainGroup
            key={domain}
            domain={domain}
            insights={grouped.get(domain)!}
            bookId={bookId}
          />
        ))}
      </div>
    </div>
  );
}
