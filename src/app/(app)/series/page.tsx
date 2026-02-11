import Link from "next/link";
import { LibraryIcon, PlusIcon } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SeriesListPage() {
  const user = await requireUser();

  const series = await db.series.findMany({
    where: { userId: user.id },
    include: {
      _count: { select: { books: true, documents: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Series</h1>
          <p className="text-sm text-muted-foreground">
            {series.length} {series.length === 1 ? "series" : "series"}
          </p>
        </div>
        <Button asChild>
          <Link href="/series/new">
            <PlusIcon className="mr-1 size-4" />
            New Series
          </Link>
        </Button>
      </div>

      {series.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LibraryIcon className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No series yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Group related books together in a series
            </p>
            <Button asChild>
              <Link href="/series/new">
                <PlusIcon className="mr-1 size-4" />
                Create Series
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <Link key={s.id} href={`/series/${s.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {s.seriesType}
                    </Badge>
                  </div>
                  {s.genre && <CardDescription>{s.genre}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {s._count.books} / {s.plannedBooks} books
                    </span>
                    <span>{s._count.documents} docs</span>
                  </div>
                  {s.description && (
                    <p className="mt-2 text-xs text-muted-foreground/70 line-clamp-2">
                      {s.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
