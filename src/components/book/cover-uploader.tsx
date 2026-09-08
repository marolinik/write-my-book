"use client";

// UDG round-5 (Igor): upload / replace / clear a book cover. Uses the dedicated
// PUT /api/books/:id/cover route (base64 data URL → S3 object key on Book.coverUrl)
// and serves preview bytes through GET /api/books/:id/cover. Reuses useLanguage for
// the labels and reacts to the live language t like every other client component.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, TrashIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

export function CoverUploader({
  bookId,
  coverUrl,
  disabled = false,
}: {
  bookId: string;
  coverUrl: string | null;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [previewTimestamp, setPreviewTimestamp] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const coverSrc =
    coverUrl && !uploading ? `/api/books/${bookId}/cover?ts=${previewTimestamp}` : null;

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
    // UDG round-6 (Igor): pre-check dimensions client-side (cover must be a workable
    // book front — reject a broken/too-wide-too-short image before uploading).
    const dims = await readImageSize(file);
    if (dims) {
      const RATIO_MAX = 4;
      if (dims.width < 100 || dims.height < 120 || dims.width > dims.height * RATIO_MAX) {
        toast.error(t.bookSettings.coverDimensionsError);
        return;
      }
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read-failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/books/${bookId}/cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "upload-failed");
      }
      setPreviewTimestamp(Date.now());
      toast.success(t.bookSettings.coverSaved);
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

  async function removeCover() {
    setUploading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/cover`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove-failed");
      setPreviewTimestamp(Date.now());
      toast.success(t.bookSettings.coverRemoved);
    } catch {
      toast.error(t.bookSettings.coverError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="relative flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt={t.bookSettings.coverPreview}
            className="h-full w-full object-cover"
          />
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
          {uploading ? t.bookSettings.coverUploading : t.bookSettings.coverUpload}
        </Button>
        {coverUrl ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => void removeCover()}
            className="gap-1 self-start"
          >
            <TrashIcon className="size-4" />
            {t.bookSettings.coverRemove}
          </Button>
        ) : null}
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          {t.bookSettings.coverHint}
        </p>
      </div>
    </div>
  );
}

/** Read an image's pixel dimensions client-side (best-effort via createImageBitmap) to pre-check cover size sanity. */
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof createImageBitmap !== "function") {
      resolve(null);
      return;
    }
    try {
      createImageBitmap(file)
        .then((bmp) => {
          const r = { width: bmp.width, height: bmp.height };
          bmp.close?.();
          resolve(r);
        })
        .catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}