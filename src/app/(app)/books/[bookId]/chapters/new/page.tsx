"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateChapter } from "@/hooks/use-chapters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewChapterPage() {
  const router = useRouter();
  const { bookId } = useParams<{ bookId: string }>();
  const createChapter = useCreateChapter(bookId);

  const [chapterNumber, setChapterNumber] = useState(1);
  const [actNumber, setActNumber] = useState(1);
  const [title, setTitle] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const chapter = await createChapter.mutateAsync({
        chapterNumber,
        actNumber,
        title: title.trim() || undefined,
      });
      toast.success("Chapter created");
      router.push(`/books/${bookId}/chapters/${chapter.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">New Chapter</CardTitle>
          <CardDescription>Add a new chapter to your book</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chapterNumber">Chapter Number *</Label>
                <Input
                  id="chapterNumber"
                  type="number"
                  min={1}
                  max={999}
                  value={chapterNumber}
                  onChange={(e) =>
                    setChapterNumber(parseInt(e.target.value) || 1)
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actNumber">Act Number *</Label>
                <Input
                  id="actNumber"
                  type="number"
                  min={1}
                  max={10}
                  value={actNumber}
                  onChange={(e) =>
                    setActNumber(parseInt(e.target.value) || 1)
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Chapter title..."
                maxLength={200}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createChapter.isPending}>
                {createChapter.isPending
                  ? "Creating..."
                  : "Create Chapter"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
