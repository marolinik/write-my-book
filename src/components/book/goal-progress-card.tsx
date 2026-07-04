"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { TargetIcon, CheckIcon, XIcon } from "lucide-react";

interface GoalProgressCardProps {
  type: "daily" | "weekly" | "total";
  target: number;
  current: number;
  onSetGoal: (target: number) => void;
  language?: string;
}

export function GoalProgressCard({
  type,
  target,
  current,
  onSetGoal,
}: GoalProgressCardProps) {
  const { t } = useLanguage();
  const locale = useLocale();
  const s = t.writingDashboard;
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(target > 0 ? String(target) : "");

  const label =
    type === "daily" ? s.dailyGoal : type === "weekly" ? s.weeklyGoal : s.totalGoal;

  const percentage = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const isComplete = target > 0 && current >= target;

  function handleSubmit() {
    const num = parseInt(inputValue, 10);
    if (num > 0) {
      onSetGoal(num);
      setEditing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TargetIcon className="size-4 text-muted-foreground" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {target > 0 ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums">
                {current.toLocaleString(locale)}
              </span>
              <span className="text-sm text-muted-foreground">
                / {target.toLocaleString(locale)}
              </span>
            </div>
            <Progress
              value={percentage}
              className={isComplete ? "[&>[data-slot=progress-indicator]]:bg-green-500" : ""}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percentage}%</span>
              {isComplete ? (
                <span className="flex items-center gap-1 text-green-500 font-medium">
                  <CheckIcon className="size-3" />
                  Complete
                </span>
              ) : (
                <span>{(target - current).toLocaleString(locale)} remaining</span>
              )}
            </div>
          </>
        ) : null}

        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="Word count target"
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="icon-xs" variant="ghost" onClick={handleSubmit}>
              <CheckIcon className="size-3" />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => setEditing(false)}>
              <XIcon className="size-3" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setInputValue(target > 0 ? String(target) : "");
              setEditing(true);
            }}
          >
            {s.setGoal}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
