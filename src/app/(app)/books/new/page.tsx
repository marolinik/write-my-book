"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCreateBook } from "@/hooks/use-books";
import { useSeries } from "@/hooks/use-series";
import { useLanguage } from "@/components/providers/language-provider";
// L-1/L-3: the book pickers all read BOOK_LANGUAGES. This page used to read
// the UI list, which offered hr (unselectable everywhere else, so the field
// then rendered empty) and hid nl, pl, sv and tr, which are valid book
// languages the prompts understand.
import { BOOK_LANGUAGES } from "@/lib/i18n/book-languages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewBookPage() {
  const router = useRouter();
  const { t, language: writerLanguage, isLoading: languageLoading } = useLanguage();
  const createBook = useCreateBook();
  const { data: seriesList } = useSeries();

  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  // V-8: the book's prose language defaults to the writer's own. It used to be
  // hardcoded "en", and because the form always sends an explicit language the
  // API's preferredLanguage fallback never fired — a Serbian writer who did not
  // notice this picker got an English book, and Book.language is what every
  // agent prompt enforces. The writer's own choice always wins.
  const [language, setLanguage] = useState(writerLanguage);
  const [languagePicked, setLanguagePicked] = useState(false);
  useEffect(() => {
    if (!languagePicked && !languageLoading) setLanguage(writerLanguage);
  }, [writerLanguage, languageLoading, languagePicked]);
  const [seriesId, setSeriesId] = useState<string>("none");
  const [bookNumber, setBookNumber] = useState(1);
  // D-154: the name is required, but the guard was a bare `return` — a silent
  // no-op. Three distinct paths all landed the writer in dead air:
  //   1. "Start writing" (type="submit") + a TRULY EMPTY name — native
  //      `required` validation FIRES FIRST and blocks the submit event, so
  //      `onSubmit` never runs and this component's guard never executes. On the
  //      D1 cold-funnel capture device the native bubble was silent (mobile
  //      browsers routinely render no message), so the reported "primary button
  //      does nothing" was this path — the one the inline handler could not even
  //      reach. The form now sets `noValidate` (below) so submit ALWAYS reaches
  //      createAndGo and the same inline block shows on every device.
  //   2. "Start writing" + a WHITESPACE-ONLY name — passes native `required`,
  //      then hit the silent `return`.
  //   3. "Guided setup instead" (type="button", never submits) + empty OR
  //      whitespace — native validation never applies, straight to the return.
  // All three now surface the block (aria-invalid + a role=alert message +
  // focus) instead of swallowing it. `required` is kept for AT/semantics; only
  // its native UI is opted out (noValidate) so our styled, localized message is
  // the single source of truth.
  const [nameError, setNameError] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function createAndGo(mode: "write" | "setup") {
    if (!name.trim()) {
      // D-154: not a silent return — tell the writer why nothing happened and
      // send focus to the field they need to fix.
      setNameError(true);
      nameInputRef.current?.focus();
      return;
    }
    try {
      const book = await createBook.mutateAsync({
        name: name.trim(),
        genre: genre.trim() || undefined,
        language,
        seriesId: seriesId !== "none" ? seriesId : undefined,
        bookNumber: seriesId !== "none" ? bookNumber : undefined,
      });
      toast.success(t.newBook.bookCreated);
      router.push(
        mode === "setup"
          ? `/books/${book.id}/setup?step=1`
          : `/books/${book.id}/chapters/${book.firstChapterId}`
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void createAndGo("write");
  }

  return (
    <div className="mx-auto max-w-lg p-6 lg:p-8">
      <Card>
        <CardHeader>
          {/* D-54: the page's main title is its level-one heading. CardTitle
              renders a <div>, so an explicit <h1> is needed for
              page-has-heading-one; it keeps the CardTitle slot/styling. */}
          <h1
            data-slot="card-title"
            className="font-display text-xl font-semibold leading-none"
          >
            {t.newBook.title}
          </h1>
          <CardDescription>{t.newBook.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* D-154: opt out of native constraint-validation UI so the submit
              path always reaches createAndGo (native `required` otherwise blocks
              the submit event on an empty name and its bubble is silent on
              mobile — the exact reported no-op). The inline role=alert below is
              the single, consistent feedback surface across all buttons/devices.
              `required` stays on the input for accessibility semantics. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t.newBook.bookName} *</Label>
              <Input
                ref={nameInputRef}
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // Clear the block as soon as the writer starts fixing it.
                  if (nameError) setNameError(false);
                }}
                placeholder={t.appUI.myNovel}
                required
                maxLength={200}
                aria-invalid={nameError || undefined}
                aria-describedby={nameError ? "name-error" : undefined}
              />
              {nameError && (
                <p
                  id="name-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {t.newBook.nameRequired}
                </p>
              )}
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
              <Select
                value={language}
                onValueChange={(value) => {
                  setLanguagePicked(true);
                  setLanguage(value);
                }}
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOK_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.label}
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
                      <SelectValue placeholder={t.appUI.noSeries} />
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

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {t.newBook.cancel}
              </Button>
              <Button type="submit" disabled={createBook.isPending}>
                {createBook.isPending ? t.newBook.creating : "Start writing"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={createBook.isPending}
                onClick={() => void createAndGo("setup")}
                className="text-muted-foreground"
              >{t.pagesUI.guidedSetupInstead}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
