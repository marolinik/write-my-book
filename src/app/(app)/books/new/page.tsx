"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateBook } from "@/hooks/use-books";
import { useSeries } from "@/hooks/use-series";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
];

export default function NewBookPage() {
  const router = useRouter();
  const createBook = useCreateBook();
  const { data: seriesList } = useSeries();

  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("en");
  const [seriesId, setSeriesId] = useState<string>("");
  const [bookNumber, setBookNumber] = useState(1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const book = await createBook.mutateAsync({
        name: name.trim(),
        genre: genre.trim() || undefined,
        language,
        seriesId: seriesId || undefined,
        bookNumber: seriesId ? bookNumber : undefined,
      });
      toast.success("Book created");
      router.push(`/books/${book.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">New Book</CardTitle>
          <CardDescription>Create a new book to start writing</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Book Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Novel"
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Fantasy, Sci-Fi, Romance..."
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {seriesList && seriesList.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="series">Series (optional)</Label>
                  <Select value={seriesId} onValueChange={setSeriesId}>
                    <SelectTrigger id="series">
                      <SelectValue placeholder="No series" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No series</SelectItem>
                      {seriesList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {seriesId && (
                  <div className="space-y-2">
                    <Label htmlFor="bookNumber">Book Number</Label>
                    <Input
                      id="bookNumber"
                      type="number"
                      min={1}
                      max={99}
                      value={bookNumber}
                      onChange={(e) =>
                        setBookNumber(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createBook.isPending}>
                {createBook.isPending ? "Creating..." : "Create Book"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
