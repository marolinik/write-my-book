"use client";

import { useMemo } from "react";
import {
  HeartPulseIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  TrendingUpIcon,
  BarChart3Icon,
  BookOpenIcon,
  UsersIcon,
  ClockIcon,
  MapPinIcon,
  XCircleIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useBookState } from "@/hooks/use-book-state";

/**
 * PILLAR 4P: Story Health Dashboard
 * Like a code quality dashboard but for manuscripts.
 * Shows at a glance: what's strong, what needs attention.
 */

interface HealthMetric {
  label: string;
  icon: React.ElementType;
  score: number; // 0-100
  status: "healthy" | "warning" | "critical";
  detail: string;
}

interface StoryHealthDashboardProps {
  bookId: string;
}

export function StoryHealthDashboard({ bookId }: StoryHealthDashboardProps) {
  const bs = useBookState(bookId);

  const metrics = useMemo((): HealthMetric[] => {
    if (bs.isLoading) return [];

    const cs = bs.chapterStatuses;
    const total = bs.chapterCount;
    if (total === 0) return [];

    const draftedPlus = (cs.drafted ?? 0) + (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.beta_passed ?? 0);
    const editedPlus = (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.beta_passed ?? 0);
    const betaPassed = cs.beta_passed ?? 0;
    const pending = bs.pendingFindingsCount ?? 0;

    const draftPct = Math.round((draftedPlus / total) * 100);
    const editPct = Math.round((editedPlus / total) * 100);
    const betaPct = Math.round((betaPassed / total) * 100);
    const findingHealth = pending === 0 ? 100 : Math.max(0, 100 - pending * 2);

    return [
      {
        label: "Drafting Progress",
        icon: BookOpenIcon,
        score: draftPct,
        status: draftPct >= 100 ? "healthy" : draftPct >= 50 ? "warning" : "critical",
        detail: `${draftedPlus}/${total} chapters drafted`,
      },
      {
        label: "Editorial Coverage",
        icon: BarChart3Icon,
        score: editPct,
        status: editPct >= 80 ? "healthy" : editPct >= 30 ? "warning" : "critical",
        detail: `${editedPlus}/${total} chapters edited`,
      },
      {
        label: "Beta Validation",
        icon: UsersIcon,
        score: betaPct,
        status: betaPct >= 80 ? "healthy" : betaPct >= 20 ? "warning" : "critical",
        detail: `${betaPassed}/${total} chapters passed`,
      },
      {
        label: "Findings Health",
        icon: HeartPulseIcon,
        score: findingHealth,
        status: findingHealth >= 80 ? "healthy" : findingHealth >= 50 ? "warning" : "critical",
        detail: pending === 0 ? "No unreviewed findings" : `${pending} findings need review`,
      },
      {
        label: "Foundation",
        icon: MapPinIcon,
        score: [bs.hasFingerprint, bs.hasStoryBible, bs.hasArchitecture].filter(Boolean).length * 33,
        status:
          bs.hasFingerprint && bs.hasStoryBible && bs.hasArchitecture ? "healthy" :
          bs.hasFingerprint || bs.hasStoryBible ? "warning" : "critical",
        detail: [
          bs.hasFingerprint ? "✓ Style" : "✗ Style",
          bs.hasStoryBible ? "✓ Bible" : "✗ Bible",
          bs.hasArchitecture ? "✓ Architecture" : "✗ Architecture",
        ].join(", "),
      },
    ];
  }, [bs]);

  const overallScore = metrics.length > 0
    ? Math.round(metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length)
    : 0;

  const statusColor = overallScore >= 75 ? "text-green-500" : overallScore >= 45 ? "text-amber-500" : "text-red-500";
  const statusBg = overallScore >= 75 ? "bg-green-500/10" : overallScore >= 45 ? "bg-amber-500/10" : "bg-red-500/10";

  if (bs.isLoading || metrics.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <HeartPulseIcon className="size-4" />
            Story Health
          </CardTitle>
          <Badge className={`${statusBg} ${statusColor} border-0 text-xs`}>
            {overallScore}% healthy
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="size-3" />
                  {m.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{m.detail}</span>
                  {m.status === "healthy" && <CheckCircle2Icon className="size-3 text-green-500" />}
                  {m.status === "warning" && <AlertTriangleIcon className="size-3 text-amber-500" />}
                  {m.status === "critical" && <XCircleIcon className="size-3 text-red-500" />}
                </div>
              </div>
              <Progress
                value={m.score}
                className={`h-1.5 ${
                  m.status === "healthy" ? "" :
                  m.status === "warning" ? "[&>div]:bg-amber-500" :
                  "[&>div]:bg-red-500"
                }`}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
