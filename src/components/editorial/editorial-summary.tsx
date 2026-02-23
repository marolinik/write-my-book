"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEditorialSummary } from "@/hooks/use-editorial";

interface EditorialSummaryProps {
  bookId: string;
}

function SeverityBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="capitalize">{label}</span>
        <span className="text-muted-foreground">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EditorialSummary({ bookId }: EditorialSummaryProps) {
  const { data, isLoading } = useEditorialSummary(bookId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const severityColors: Record<string, string> = {
    critical: "bg-red-500 dark:bg-red-600",
    major: "bg-orange-500 dark:bg-orange-600",
    moderate: "bg-yellow-500 dark:bg-yellow-600",
    minor: "bg-gray-500 dark:bg-gray-400",
  };

  return (
    <div className="space-y-4 p-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <span className="text-2xl font-bold">{data.total}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <span className="text-2xl font-bold">{data.pending}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Applied
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.applied}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Dismissed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <span className="text-2xl font-bold">{data.dismissed}</span>
          </CardContent>
        </Card>
      </div>

      {/* Severity breakdown */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs text-muted-foreground">
            Severity breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0">
          {["critical", "major", "moderate", "minor"].map((sev) => (
            <SeverityBar
              key={sev}
              label={sev}
              count={data.bySeverity[sev] ?? 0}
              total={data.total}
              color={severityColors[sev] ?? "bg-gray-500 dark:bg-gray-400"}
            />
          ))}
        </CardContent>
      </Card>

      {/* Pipeline progress */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs text-muted-foreground">
            Chapters with pending findings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <span className="text-2xl font-bold">
            {data.chaptersWithPending}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
