"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  BellIcon,
  AlertTriangleIcon,
  ClockIcon,
  SparklesIcon,
  BookOpenIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * R: Proactive Notifications.
 * "Ch. 3 hasn't been touched in 14 days."
 * "You have 23 unreviewed findings."
 * "Your streak will break if you don't write today!"
 * 
 * Non-annoying: shows as a card, not a popup.
 * Prioritized by impact on the writer's progress.
 */

interface Chapter {
  chapterNumber: number;
  title: string | null;
  status: string;
  updatedAt: string;
}

interface ProactiveNotificationsProps {
  bookId: string;
  chapters: Chapter[];
  pendingFindings: number;
  currentStreak: number;
  todayWords: number;
  lastWritingDate?: string;
}

interface Notification {
  id: string;
  icon: React.ElementType;
  message: string;
  detail?: string;
  href?: string;
  priority: "high" | "medium" | "low";
  color: string;
}

export function ProactiveNotifications({
  bookId,
  chapters,
  pendingFindings,
  currentStreak,
  todayWords,
  lastWritingDate,
}: ProactiveNotificationsProps) {
  const notifications = useMemo((): Notification[] => {
    const notifs: Notification[] = [];
    const now = Date.now();

    // Streak at risk
    if (currentStreak >= 3 && todayWords === 0) {
      notifs.push({
        id: "streak-risk",
        icon: AlertTriangleIcon,
        message: `Your ${currentStreak}-day streak is at risk!`,
        detail: "Write even 50 words to keep it alive.",
        priority: "high",
        color: "text-orange-500",
      });
    }

    // Pending findings
    if (pendingFindings >= 10) {
      notifs.push({
        id: "findings",
        icon: SparklesIcon,
        message: `${pendingFindings} findings waiting for review`,
        detail: "Your editors have suggestions ready.",
        href: `/books/${bookId}/editorial`,
        priority: "medium",
        color: "text-blue-500",
      });
    }

    // Stale chapters (not touched in 14+ days)
    for (const ch of chapters) {
      const daysSince = Math.floor((now - new Date(ch.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 14 && ch.status !== "beta_passed") {
        notifs.push({
          id: `stale-${ch.chapterNumber}`,
          icon: ClockIcon,
          message: `Ch.${ch.chapterNumber}${ch.title ? ` "${ch.title}"` : ""} — ${daysSince} days untouched`,
          detail: `Status: ${ch.status.replace(/_/g, " ")}`,
          href: `/books/${bookId}/chapters/${ch.chapterNumber}`,
          priority: daysSince >= 30 ? "medium" : "low",
          color: "text-amber-500",
        });
      }
    }

    // Sort by priority
    const order = { high: 0, medium: 1, low: 2 };
    return notifs.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 5);
  }, [bookId, chapters, pendingFindings, currentStreak, todayWords]);

  if (notifications.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BellIcon className="size-4" />
          Heads Up
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {notifications.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {notifications.map((n) => {
          const Icon = n.icon;
          const content = (
            <div className="flex items-start gap-2 rounded-md border p-2 hover:bg-muted/30 transition-colors">
              <Icon className={`size-4 shrink-0 mt-0.5 ${n.color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{n.message}</p>
                {n.detail && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.detail}</p>
                )}
              </div>
            </div>
          );

          return n.href ? (
            <Link key={n.id} href={n.href}>{content}</Link>
          ) : (
            <div key={n.id}>{content}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
