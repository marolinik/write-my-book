"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadIcon,
  MessageCircleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
} from "lucide-react";

import { useCreateBook } from "@/hooks/use-books";
import { useSeries } from "@/hooks/use-series";
import { useLanguage } from "@/components/providers/language-provider";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";
import { useAgentUIStore } from "@/stores/agent-ui-store";
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

type PagePhase = "create" | "next-steps";

export default function NewBookPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const createBook = useCreateBook();
  const { data: seriesList } = useSeries();
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);

  const [phase, setPhase] = useState<PagePhase>("create");
  const [createdBookId, setCreatedBookId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("en");
  const [seriesId, setSeriesId] = useState<string>("none");
  const [bookNumber, setBookNumber] = useState(1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const book = await createBook.mutateAsync({
        name: name.trim(),
        genre: genre.trim() || undefined,
        language,
        seriesId: seriesId !== "none" ? seriesId : undefined,
        bookNumber: seriesId !== "none" ? bookNumber : undefined,
      });
      toast.success(t.newBook.bookCreated);
      setCreatedBookId(book.id);
      setPhase("next-steps");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // After book is created: show two paths
  if (phase === "next-steps" && createdBookId) {
    return (
      <div className="mx-auto max-w-lg p-6 lg:p-8">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-green-100 dark:bg-green-950/30 p-3">
                <CheckCircle2Icon className="size-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="font-display text-xl">
              &ldquo;{name}&rdquo; created!
            </CardTitle>
            <CardDescription>
              How would you like to get started?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Option 1: Import manuscript */}
            <button
              onClick={() => router.push(`/books/${createdBookId}/setup?step=1`)}
              className="flex items-center gap-4 w-full rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                <UploadIcon className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Import a manuscript</p>
                <p className="text-xs text-muted-foreground">
                  Upload a DOCX, TXT, or Markdown file and let AI analyze it
                </p>
              </div>
              <ArrowRightIcon className="size-4 text-muted-foreground shrink-0" />
            </button>

            {/* Option 2: Describe to Coach */}
            <button
              onClick={() => {
                router.push(`/books/${createdBookId}`);
                // Small delay to let navigation complete before opening agent panel
                setTimeout(() => openWithWorkflow("onboard-new-book"), 300);
              }}
              className="flex items-center gap-4 w-full rounded-lg border border-primary/30 bg-primary/5 p-4 text-left hover:bg-primary/10 transition-colors"
            >
              <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                <MessageCircleIcon className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Describe to the Writing Coach</p>
                <p className="text-xs text-muted-foreground">
                  Tell the AI about your book idea and it will generate all foundational documents
                </p>
              </div>
              <ArrowRightIcon className="size-4 text-muted-foreground shrink-0" />
            </button>

            {/* Skip to overview */}
            <div className="text-center pt-2">
              <Button
                variant="link"
                size="sm"
                className="text-muted-foreground"
                onClick={() => router.push(`/books/${createdBookId}`)}
              >
                Skip — go to book overview
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">{t.newBook.title}</CardTitle>
          <CardDescription>{t.newBook.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t.newBook.bookName} *</Label>
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
              <Label htmlFor="genre">{t.newBook.genre}</Label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder={t.newBook.genrePlaceholder}
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{t.newBook.language}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {seriesList && seriesList.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="series">{t.newBook.seriesOptional}</Label>
                  <Select value={seriesId} onValueChange={(v) => setSeriesId(v)}>
                    <SelectTrigger id="series">
                      <SelectValue placeholder="No series" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t.newBook.noSeries}</SelectItem>
                      {seriesList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {seriesId !== "none" && (
                  <div className="space-y-2">
                    <Label htmlFor="bookNumber">{t.newBook.bookNumber}</Label>
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
                {t.newBook.cancel}
              </Button>
              <Button type="submit" disabled={createBook.isPending}>
                {createBook.isPending ? t.newBook.creating : t.newBook.create}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
