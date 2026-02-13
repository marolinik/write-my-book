"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  PlusIcon,
  XIcon,
  GripVerticalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BookOpenIcon,
  PenLineIcon,
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
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [newBookName, setNewBookName] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  const addMutation = useAddBookToSeries(seriesId);
  const removeMutation = useRemoveBookFromSeries(seriesId);
  const reorderMutation = useReorderBook(seriesId);

  // Fetch all user's books that are NOT in any series
  const { data: availableBooks } = useQuery({
    queryKey: ["books-available-for-series"],
    queryFn: async () => {
      const res = await fetch("/api/books");
      if (!res.ok) throw new Error("Failed to load books");
      const data = await res.json();
      const allBooks: Array<{
        id: string;
        name: string;
        wordCount: number;
        seriesId: string | null;
        status: string;
      }> = data.books ?? data ?? [];
      // Filter to books not already in any series
      return allBooks.filter((b) => !b.seriesId);
    },
    enabled: showAddForm && addMode === "existing",
  });

  const handleAddExisting = async () => {
    if (!selectedBookId) return;
    await addMutation.mutateAsync({ bookId: selectedBookId });
    setSelectedBookId(null);
    setShowAddForm(false);
  };

  const handleAddNew = async () => {
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
        <div className="flex flex-col gap-3 rounded-md border p-3">
          {/* Mode toggle */}
          <div className="flex gap-1">
            <Button
              variant={addMode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setAddMode("existing")}
              className="text-xs"
            >
              <BookOpenIcon className="mr-1 size-3" />
              Existing Book
            </Button>
            <Button
              variant={addMode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setAddMode("new")}
              className="text-xs"
            >
              <PenLineIcon className="mr-1 size-3" />
              New Book
            </Button>
          </div>

          {addMode === "existing" ? (
            <div className="flex flex-col gap-2">
              {!availableBooks || availableBooks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No books available. All your books are already in a series, or you
                  haven't created any yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {availableBooks.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => setSelectedBookId(book.id)}
                      className={`flex items-center justify-between rounded-md border p-2 text-left text-sm transition-colors ${
                        selectedBookId === book.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium">{book.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {book.wordCount.toLocaleString()} words
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddExisting}
                  disabled={!selectedBookId || addMutation.isPending}
                >
                  Add to Series
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedBookId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Book title..."
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNew()}
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleAddNew}
                disabled={!newBookName.trim() || addMutation.isPending}
              >
                Create
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
