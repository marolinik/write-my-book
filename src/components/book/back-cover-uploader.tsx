"use client";

// UDG round-8 (Igor/Olivera): upload / replace / clear the book's back cover,
// stored via PUT /api/books/:id/back-cover and bound into exports as a trailing
// back-cover page. Simpler than CoverUploader (no crop editor) — back covers are
// usually pre-exported marketing art.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, TrashIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

export function BackCoverUploader({
  bookId,
  backCoverUrl,
  disabled = false,
}: {
  bookId: string;
  backCoverUrl: string | null;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [previewTimestamp, setPreviewTimestamp] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const src = backCoverUrl
    ? `/api/books/${bookId}/back-cover?ts=${previewTimestamp}`
    : null;

  async function onFileSelected(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      toast.error(t.bookSettings.coverTypeError);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t.bookSettings.coverTooLarge);
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read-failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/books/${bookId}/back-cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "upload-failed");
      }
      setPreviewTimestamp(Date.now());
      toast.success(t.bookSettings.backCoverSaved);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "upload-failed"
          ? error.message
          : t.bookSettings.coverError
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeBackCover() {
    setUploading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/back-cover`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove-failed");
      setPreviewTimestamp(Date.now());
      toast.success(t.bookSettings.backCoverRemoved);
    } catch {
      toast.error(t.bookSettings.coverError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="relative flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={t.bookSettings.backCoverLabel} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-1 self-start"
        >
          <UploadIcon className="size-4" />
          {uploading ? t.bookSettings.coverUploading : t.bookSettings.backCoverUpload}
        </Button>
        {backCoverUrl ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => void removeBackCover()}
            className="gap-1 self-start"
          >
            <TrashIcon className="size-4" />
            {t.bookSettings.backCoverRemove}
          </Button>
        ) : null}
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          {t.bookSettings.backCoverHint}
        </p>
      </div>
    </div>
  );
}