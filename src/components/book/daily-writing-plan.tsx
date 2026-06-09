"use client";

import { useState } from "react";
import {
  SparklesIcon,
  Loader2Icon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleDotIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

/**
 * Q: AI-Generated Daily Writing Plan.
 * Shows a personalized "Today's Plan" based on:
 * - Where the writer left off
 * - Pending findings
 * - Chapter status pipeline
 * - Writing goals/targets
 * - Recent velocity
 */

interface PlanItem {
  id: string;
  type: "write" | "edit" | "review" | "plan";
  title: string;
  detail: string;
  estimatedMinutes: number;
  href: string;
  priority: "high" | "medium" | "low";
}

interface DailyWritingPlanProps {
  bookId: string;
}

const TYPE_ICONS = {
  write: "✍️",
  edit: "🔍",
  review: "📋",
  plan: "🗺️",
};

export function DailyWritingPlan({ bookId }: DailyWritingPlanProps) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ plan: PlanItem[]; greeting: string }>({
    queryKey: ["daily-plan", bookId],
    queryFn: () => fetchJson(`/api/books/${bookId}/daily-plan`),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const toggleComplete = (id: string) => {
    setCompletedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = data?.plan ?? [];
  const completedCount = completedItems.size;
  const totalMinutes = items.reduce((s, i) => s + i.estimatedMinutes, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarIcon className="size-4" />
            Today&apos;s Plan
          </CardTitle>
          {items.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              ~{totalMinutes} min &bull; {completedCount}/{items.length} done
            </span>
          )}
        </div>
        {data?.greeting && (
          <p className="text-xs text-muted-foreground mt-1">{data.greeting}</p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 justify-center text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Generating your plan...
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No tasks for today — enjoy your break! 🎉
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const isComplete = completedItems.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleComplete(item.id)}
                  className={`flex items-start gap-2.5 w-full rounded-md border p-2.5 text-left transition-all ${
                    isComplete ? "opacity-50 bg-muted/30 line-through" : "hover:bg-muted/30"
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2Icon className="size-4 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <CircleDotIcon className="size-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{TYPE_ICONS[item.type]}</span>
                      <span className="text-xs font-medium">{item.title}</span>
                      <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                        ~{item.estimatedMinutes}m
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
