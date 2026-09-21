"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateSeries } from "@/hooks/use-series";
import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
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

/** The shape of a series, named for how many books it holds. */
const SERIES_TYPES: ReadonlyArray<{ value: string; label: (t: UIStrings) => string }> = [
  { value: "DUOLOGY", label: (t) => t.pagesUI.seriesDuology },
  { value: "TRILOGY", label: (t) => t.pagesUI.seriesTrilogy },
  { value: "TETRALOGY", label: (t) => t.pagesUI.seriesTetralogy },
  { value: "PENTALOGY", label: (t) => t.pagesUI.seriesPentalogy },
  { value: "SAGA", label: (t) => t.pagesUI.seriesSaga },
  { value: "OPEN", label: (t) => t.pagesUI.seriesOpenEnded },
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
      toast.success(t.toasts.seriesCreated);
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
              <Label htmlFor="title">{t.workspaceUI.seriesTitleRequired}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.workspaceUI.seriesTitleExample}
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">{t.workspaceUI.genre}</Label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder={t.workspaceUI.genreExample}
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seriesType">{t.workspaceUI.seriesType}</Label>
              <Select value={seriesType} onValueChange={setSeriesType}>
                <SelectTrigger id="seriesType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERIES_TYPES.map((shape) => (
                    <SelectItem key={shape.value} value={shape.value}>
                      {shape.label(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plannedBooks">{t.workspaceUI.plannedBooks}</Label>
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
              <Label htmlFor="description">{t.workspaceUI.description}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.workspaceUI.descriptionExample}
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
