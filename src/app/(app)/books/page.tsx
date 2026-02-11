import Link from "next/link";
import {
  BookOpenIcon,
  PlusIcon,
} from "lucide-react";

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

export default async function BooksPage() {
  const user = await requireUser();

  const books = await db.book.findMany({
    where: { userId: user.id },
    include: {
      series: { select: { id: true, title: true } },
      _count: { select: { chapters: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Books</h1>
          <p className="text-sm text-muted-foreground">
            {books.length} {books.length === 1 ? "book" : "books"}
          </p>
        </div>
        <Button asChild>
          <Link href="/books/new">
            <PlusIcon className="mr-1 size-4" />
            New Book
          </Link>
        </Button>
      </div>

      {books.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpenIcon className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No books yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start your writing journey by creating your first book
            </p>
            <Button asChild>
              <Link href="/books/new">
                <PlusIcon className="mr-1 size-4" />
                Create Book
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Link key={book.id} href={`/books/${book.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{book.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {book.status}
                    </Badge>
                  </div>
                  {book.genre && (
                    <CardDescription>{book.genre}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{book.wordCount.toLocaleString()} words</span>
                    <span>{book._count.chapters} chapters</span>
                  </div>
                  {book.series && (
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Series: {book.series.title} (#{book.bookNumber})
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Updated {new Date(book.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
