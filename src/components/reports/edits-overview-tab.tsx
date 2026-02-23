"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function EditsOverviewTab({ bookId }: { bookId: string }) {
  const { data: findings, isLoading } = useQuery({
    queryKey: ["editorial-findings-overview", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/editorial/findings?limit=200`);
      if (!res.ok) throw new Error("Failed to load findings");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = findings?.findings ?? [];
  const total = items.length;
  const pending = items.filter((f: any) => f.status === "pending").length;
  const applied = items.filter((f: any) => f.status === "applied").length;
  const dismissed = items.filter((f: any) => f.status === "dismissed").length;
  const critical = items.filter((f: any) => f.severity === "critical").length;
  const major = items.filter((f: any) => f.severity === "major").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Findings</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Applied</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{applied}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dismissed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-muted-foreground">{dismissed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical + Major</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{critical + major}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Findings</CardTitle>
          <CardDescription>Latest editorial findings across all chapters</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No editorial findings yet. Run an editor agent to generate findings.
            </p>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 20).map((f: any) => (
                <div
                  key={f.id}
                  className="flex items-start justify-between rounded-md border p-3 text-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          f.severity === "critical"
                            ? "destructive"
                            : f.severity === "major"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {f.severity}
                      </Badge>
                      <Badge variant="outline">{f.category}</Badge>
                      <span className="text-muted-foreground">
                        Ch. {f.chapterNumber}
                      </span>
                    </div>
                    <p>{f.description}</p>
                  </div>
                  <Badge
                    variant={
                      f.status === "applied"
                        ? "default"
                        : f.status === "dismissed"
                          ? "secondary"
                          : "outline"
                    }
                    className="ml-3 shrink-0"
                  >
                    {f.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
