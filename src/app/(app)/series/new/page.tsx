"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateSeries } from "@/hooks/use-series";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const SERIES_TYPES = [
  { value: "DUOLOGY", label: "Duology (2 books)" },
  { value: "TRILOGY", label: "Trilogy (3 books)" },
  { value: "TETRALOGY", label: "Tetralogy (4 books)" },
  { value: "PENTALOGY", label: "Pentalogy (5 books)" },
  { value: "SAGA", label: "Saga (6+ books)" },
  { value: "OPEN", label: "Open-ended" },
];

export default function NewSeriesPage() {
  const router = useRouter();
  const createSeries = useCreateSeries();
  const { t } = useLanguage();
  const s = t.seriesPage;

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [seriesType, setSeriesType] = useState("TRILOGY");
  const [plannedBooks, setPlannedBooks] = useState(3);
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const series = await createSeries.mutateAsync({
        title: title.trim(),
        genre: genre.trim() || undefined,
        seriesType,
        plannedBooks,
        description: description.trim() || undefined,
      });
      toast.success("Series created");
      router.push(`/series/${series.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">{s.newSeries}</CardTitle>
          <CardDescription>
            {s.noSeriesDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Series Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="The Dark Tower"
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
              <Label htmlFor="seriesType">Series Type</Label>
              <Select value={seriesType} onValueChange={setSeriesType}>
                <SelectTrigger id="seriesType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERIES_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plannedBooks">Planned Books</Label>
              <Input
                id="plannedBooks"
                type="number"
                min={1}
                max={99}
                value={plannedBooks}
                onChange={(e) =>
                  setPlannedBooks(parseInt(e.target.value) || 3)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of your series..."
                maxLength={2000}
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {t.common.close}
              </Button>
              <Button type="submit" disabled={createSeries.isPending}>
                {createSeries.isPending ? t.common.loading : s.createSeries}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
