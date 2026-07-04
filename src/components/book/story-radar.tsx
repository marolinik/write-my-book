"use client";

import {
  RadarIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  RefreshCwIcon,
  Loader2Icon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import type { RadarAlert } from "@/lib/radar/alerts";

/**
 * G: Story Radar — lightweight pacing & staleness checks.
 * Flags two things from chapter word counts and timestamps:
 *   - pacing:    chapters that are unusually short or long vs the book average
 *   - structure: chapters left unchanged for a long time (staleness)
 * Deeper continuity / character / style analysis is not implemented yet.
 */

interface StoryRadarProps {
  bookId: string;
}

const SEVERITY_STYLES = {
  critical: { icon: AlertTriangleIcon, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  warning: { icon: AlertTriangleIcon, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  info: { icon: InfoIcon, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
};

export function StoryRadar({ bookId }: StoryRadarProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ alerts: RadarAlert[] }>({
    queryKey: ["story-radar", bookId],
    queryFn: () => fetchJson(`/api/books/${bookId}/radar`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const issues = data?.alerts ?? [];
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <RadarIcon className="size-4" />
            Story Radar
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">{criticalCount} critical</Badge>
            )}
            {warningCount > 0 && (
              <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">{warningCount} warnings</Badge>
            )}
            {data && issues.length === 0 && (
              <Badge variant="secondary" className="text-[10px] text-green-600">All clear</Badge>
            )}
            <Button
              variant="ghost" size="icon" className="size-6"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
            <Loader2Icon className="size-3 animate-spin" />
            Checking pacing &amp; staleness...
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <AlertTriangleIcon className="size-8 text-amber-500/40" />
            <p className="text-xs text-muted-foreground">Couldn&apos;t run the radar checks.</p>
            <Button
              variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Retry
            </Button>
          </div>
        ) : data && issues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2Icon className="size-8 text-green-500/30" />
            <p className="text-xs text-muted-foreground">No pacing or staleness issues detected.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {issues.map((alert) => {
                const style = SEVERITY_STYLES[alert.severity];
                const Icon = style.icon;
                const location = alert.chapterNumber != null ? `Ch.${alert.chapterNumber}` : undefined;
                return (
                  <div key={alert.id} className={`rounded-md border p-2.5 ${style.bg}`}>
                    <div className="flex items-start gap-2">
                      <Icon className={`size-3.5 shrink-0 mt-0.5 ${style.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[8px] px-1">{alert.type}</Badge>
                          {location && <span className="text-[9px] text-muted-foreground">{location}</span>}
                        </div>
                        <p className="text-xs mt-0.5">{alert.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 italic">{alert.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
