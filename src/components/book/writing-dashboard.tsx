"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";
import { useWritingStats, useSetWritingGoal } from "@/hooks/use-writing-stats";
import { DailyWordChart } from "@/components/book/daily-word-chart";
import { GoalProgressCard } from "@/components/book/goal-progress-card";
import {
  PenLineIcon,
  FlameIcon,
  TrendingUpIcon,
  BookOpenIcon,
} from "lucide-react";
import { MarketingKit } from "@/components/book/marketing-kit";
import { WritingSprints } from "@/components/book/writing-sprints";
import { DraftCertificate } from "@/components/book/draft-certificate";

interface WritingDashboardProps {
  bookId: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function WritingDashboard({ bookId }: WritingDashboardProps) {
  const { t } = useLanguage();
  const s = t.writingDashboard;
  const { data, isLoading } = useWritingStats(bookId);
  const setGoal = useSetWritingGoal(bookId);

  if (isLoading || !data) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {s.title}
        </h1>
        <Separator className="my-6" />
        <DashboardSkeleton />
      </div>
    );
  }

  const dailyGoal = data.goals.find((g) => g.type === "daily");
  const weeklyGoal = data.goals.find((g) => g.type === "weekly");
  const totalGoal = data.goals.find((g) => g.type === "total");

  // Compute current weekly words (last 7 days sum)
  const last7 = data.dailyCounts.slice(-7);
  const weeklyWords = last7.reduce((sum, d) => sum + d.words, 0);

  const hasData = data.dailyCounts.some((d) => d.words > 0);

  return (
    <div className="p-6 lg:p-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {s.title}
      </h1>

      <Separator className="my-6" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={PenLineIcon}
          label={s.todayWords}
          value={data.todayWords}
        />
        <StatCard
          icon={FlameIcon}
          label={s.streak}
          value={data.streak}
          subtitle={s.days}
        />
        <StatCard
          icon={TrendingUpIcon}
          label={s.weeklyAvg}
          value={data.weeklyAvg}
        />
        <StatCard
          icon={BookOpenIcon}
          label={s.totalWords}
          value={data.totalWords}
        />
      </div>

      {/* Daily word chart */}
      <div className="mt-6">
        {hasData ? (
          <DailyWordChart data={data.dailyCounts} />
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <p className="text-muted-foreground">{s.noData}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Goal cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GoalProgressCard
          type="daily"
          target={dailyGoal?.target ?? 0}
          current={data.todayWords}
          onSetGoal={(target) => setGoal.mutate({ type: "daily", target })}
        />
        <GoalProgressCard
          type="weekly"
          target={weeklyGoal?.target ?? 0}
          current={weeklyWords}
          onSetGoal={(target) => setGoal.mutate({ type: "weekly", target })}
        />
        <GoalProgressCard
          type="total"
          target={totalGoal?.target ?? 0}
          current={data.totalWords}
          onSetGoal={(target) => setGoal.mutate({ type: "total", target })}
        />
      </div>

      {/* Writing Sprint */}
      <div className="mt-6">
        <WritingSprints bookId={bookId} currentWordCount={data.totalWords} />
      </div>

      {/* Marketing Kit */}
      <div className="mt-8">
        <MarketingKit bookId={bookId} bookTitle="" />
      </div>
    </div>
  );
}
