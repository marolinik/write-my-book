"use client";

import { useMemo } from "react";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
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
import { useLanguage } from "@/components/providers/language-provider";
import { useBookState } from "@/hooks/use-book-state";

/**
 * PILLAR 4P: Story Health Dashboard
 * Like a code quality dashboard but for manuscripts.
 * Shows at a glance: what's strong, what needs attention.
 */

interface HealthMetric {
  label: (t: UIStrings) => string;
  icon: React.ElementType;
  score: number; // 0-100
  status: "healthy" | "warning" | "critical";
  detail: string;
}

interface StoryHealthDashboardProps {
  bookId: string;
}

export function StoryHealthDashboard({ bookId }: StoryHealthDashboardProps) {
  const { t } = useLanguage();
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

    const counted = (template: string, done: number) =>
      template.replace("{done}", String(done)).replace("{total}", String(total));

    return [
      {
        label: (t: UIStrings) => t.bookUI.healthDrafting,
        icon: BookOpenIcon,
        score: draftPct,
        status: draftPct >= 100 ? "healthy" : draftPct >= 50 ? "warning" : "critical",
        detail: counted(t.importExportUI.readyDraftedDetail, draftedPlus),
      },
      {
        label: (t: UIStrings) => t.bookUI.healthEditorial,
        icon: BarChart3Icon,
        score: editPct,
        status: editPct >= 80 ? "healthy" : editPct >= 30 ? "warning" : "critical",
        detail: counted(t.bookUI.healthEditedDetail, editedPlus),
      },
      {
        label: (t: UIStrings) => t.bookUI.healthBeta,
        icon: UsersIcon,
        score: betaPct,
        status: betaPct >= 80 ? "healthy" : betaPct >= 20 ? "warning" : "critical",
        detail: counted(t.bookUI.healthBetaDetail, betaPassed),
      },
      {
        label: (t: UIStrings) => t.bookUI.healthFindings,
        icon: HeartPulseIcon,
        score: findingHealth,
        status: findingHealth >= 80 ? "healthy" : findingHealth >= 50 ? "warning" : "critical",
        detail:
          pending === 0
            ? t.importExportUI.readyFindingsNone
            : t.importExportUI.readyFindingsSome.replace("{count}", String(pending)),
      },
      {
        label: (t: UIStrings) => t.bookUI.healthFoundation,
        icon: MapPinIcon,
        score: [bs.hasFingerprint, bs.hasStoryBible, bs.hasArchitecture].filter(Boolean).length * 33,
        status:
          bs.hasFingerprint && bs.hasStoryBible && bs.hasArchitecture ? "healthy" :
          bs.hasFingerprint || bs.hasStoryBible ? "warning" : "critical",
        detail: [
          `${bs.hasFingerprint ? "✓" : "✗"} ${t.bookUI.foundStyle}`,
          `${bs.hasStoryBible ? "✓" : "✗"} ${t.bookUI.foundBible}`,
          `${bs.hasArchitecture ? "✓" : "✗"} ${t.bookUI.foundArchitecture}`,
        ].join(", "),
      },
    ];
  }, [bs, t]);

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
            <HeartPulseIcon className="size-4" />{t.bookUI.storyHealth}</CardTitle>
          <Badge className={`${statusBg} ${statusColor} border-0 text-xs`}>
            {t.bookUI.percentHealthy.replace("{percent}", String(overallScore))}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label(t)} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="size-3" />
                  {m.label(t)}
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
