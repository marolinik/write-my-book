"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PlusIcon,
  XIcon,
  GripVerticalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAddBookToSeries,
  useRemoveBookFromSeries,
  useReorderBook,
} from "@/hooks/use-series";

interface Book {
  id: string;
  bookNumber: number;
  name: string;
  status: string;
  wordCount: number;
}

interface SeriesBookManagerProps {
  seriesId: string;
  books: Book[];
}

export function SeriesBookManager({ seriesId, books }: SeriesBookManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBookName, setNewBookName] = useState("");

  const addMutation = useAddBookToSeries(seriesId);
  const removeMutation = useRemoveBookFromSeries(seriesId);
  const reorderMutation = useReorderBook(seriesId);

  const handleAdd = async () => {
    if (!newBookName.trim()) return;
    await addMutation.mutateAsync({ name: newBookName.trim() });
    setNewBookName("");
    setShowAddForm(false);
  };

  const handleRemove = (bookId: string) => {
    if (confirm("Detach this book from the series? The book won't be deleted.")) {
      removeMutation.mutate(bookId);
    }
  };

  const handleMoveUp = (bookId: string, currentNumber: number) => {
    if (currentNumber <= 1) return;
    reorderMutation.mutate({ bookId, newBookNumber: currentNumber - 1 });
  };

  const handleMoveDown = (bookId: string, currentNumber: number) => {
    if (currentNumber >= books.length) return;
    reorderMutation.mutate({ bookId, newBookNumber: currentNumber + 1 });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Books in Series</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <PlusIcon className="mr-1 size-3" />
          Add Book
        </Button>
      </div>

      {showAddForm && (
        <div className="flex gap-2">
          <Input
            placeholder="Book title..."
            value={newBookName}
            onChange={(e) => setNewBookName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!newBookName.trim() || addMutation.isPending}
          >
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddForm(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {books.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No books in this series yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {books.map((book) => (
            <Card key={book.id}>
              <CardContent className="flex items-center gap-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveUp(book.id, book.bookNumber)}
                    disabled={book.bookNumber <= 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUpIcon className="size-3" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(book.id, book.bookNumber)}
                    disabled={book.bookNumber >= books.length}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDownIcon className="size-3" />
                  </button>
                </div>

                <GripVerticalIcon className="size-4 text-muted-foreground" />

                <span className="flex size-7 items-center justify-center rounded bg-muted text-xs font-bold">
                  {book.bookNumber}
                </span>

                <Link
                  href={`/books/${book.id}`}
                  className="flex-1 text-sm font-medium hover:underline"
                >
                  {book.name}
                </Link>

                <span className="text-xs text-muted-foreground">
                  {book.wordCount.toLocaleString()} words
                </span>

                <Badge variant="secondary" className="text-xs capitalize">
                  {book.status}
                </Badge>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => handleRemove(book.id)}
                  title="Remove from series"
                >
                  <XIcon className="size-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
