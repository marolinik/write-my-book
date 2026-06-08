"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateChapter, useChapters } from "@/hooks/use-chapters";
import { useLanguage } from "@/components/providers/language-provider";
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
  const { data: chapters } = useChapters(bookId);
  const { t } = useLanguage();
  const s = t.chapterNew;

  const [chapterNumber, setChapterNumber] = useState(1);

  // Auto-increment chapter number based on existing chapters
  useEffect(() => {
    if (chapters && chapters.length > 0) {
      const maxChapterNum = Math.max(...chapters.map(ch => ch.chapterNumber));
      setChapterNumber(maxChapterNum + 1);
    }
  }, [chapters]);
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
      toast.success(s.created);
      router.push(`/books/${bookId}/chapters/${chapter.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">{s.title}</CardTitle>
          <CardDescription>{s.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chapterNumber">{s.chapterNumber} *</Label>
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
                <Label htmlFor="actNumber">{s.actNumber} *</Label>
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
              <Label htmlFor="title">{s.titleOptional}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={s.titlePlaceholder}
                maxLength={200}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {s.cancel}
              </Button>
              <Button type="submit" disabled={createChapter.isPending}>
                {createChapter.isPending ? s.creating : s.create}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
