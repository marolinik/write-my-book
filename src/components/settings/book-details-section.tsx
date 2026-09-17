"use client";

/**
 * Rename a book and change the language it is written in.
 *
 * Both were previously settable ONLY in the setup wizard: a typo in the title
 * was permanent, and a book created before the writer set their language was
 * stuck producing English documents with no way back (the agents read
 * `Book.language`, not the UI language).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBook, useUpdateBook } from "@/hooks/use-books";
import { useLanguage } from "@/components/providers/language-provider";
import { BOOK_LANGUAGES } from "@/lib/i18n/book-languages";

export function BookDetailsSection({ bookId }: { bookId: string }) {
  const { t } = useLanguage();
  const s = t.setup;
  const { data: book } = useBook(bookId);
  const updateBook = useUpdateBook(bookId);

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");

  // Seed the form once the book arrives, and re-seed when it changes
  // underneath us (another tab, the setup wizard).
  useEffect(() => {
    if (!book) return;
    setName(book.name ?? "");
    setLanguage(book.language ?? "en");
  }, [book]);

  const dirty =
    !!book && (name.trim() !== (book.name ?? "") || language !== (book.language ?? "en"));
  const canSave = dirty && name.trim().length > 0 && !updateBook.isPending;

  const handleSave = () => {
    updateBook.mutate(
      { name: name.trim(), language },
      {
        onSuccess: () => toast.success(t.common.save),
        onError: () => toast.error(t.common.error),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{s.basics}</CardTitle>
        <CardDescription>{s.basicsDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="book-name">{s.bookName}</Label>
          <Input
            id="book-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="book-language">{s.language}</Label>
          <p className="text-xs text-muted-foreground">{s.languageHint}</p>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="book-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOK_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          {updateBook.isPending ? t.common.loading : t.common.save}
        </Button>
      </CardContent>
    </Card>
  );
}
