import Link from "next/link";
import { LibraryIcon, PlusIcon } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings } from "@/lib/i18n/ui-strings";
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
  const t = getUIStrings(user.preferredLanguage ?? "en");
  const s = t.seriesPage;

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
          <h1 className="font-display text-2xl font-bold">{s.title}</h1>
          <p className="text-sm text-muted-foreground">
            {series.length} {series.length === 1 ? "series" : "series"}
          </p>
        </div>
        <Button asChild>
          <Link href="/series/new">
            <PlusIcon className="mr-1 size-4" />
            {s.newSeries}
          </Link>
        </Button>
      </div>

      {series.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LibraryIcon className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">{s.noSeries}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {s.noSeriesDesc}
            </p>
            <Button asChild>
              <Link href="/series/new">
                <PlusIcon className="mr-1 size-4" />
                {s.createSeries}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((item) => (
            <Link key={item.id} href={`/series/${item.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {item.seriesType}
                    </Badge>
                  </div>
                  {item.genre && <CardDescription>{item.genre}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {item._count.books} / {item.plannedBooks} {s.books}
                    </span>
                    <span>{item._count.documents} {s.docs}</span>
                  </div>
                  {item.description && (
                    <p className="mt-2 text-xs text-muted-foreground/70 line-clamp-2">
                      {item.description}
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
