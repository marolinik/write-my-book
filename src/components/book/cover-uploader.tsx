"use client";

// UDG round-8 (Igor): inline crop/position editor for the book cover. Picking an
// image (or re-cropping an existing cover via "Re-crop") opens a modal that frames
// the cover at a 2:3 book aspect with zoom + pan sliders. "Apply crop" bakes the
// visible region into a JPEG data URL (quality 0.92) that is PUT to
// /api/books/:id/cover — the cropping is baked into the saved file, matching the
// export pipeline's ![...] cover binding.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CropIcon, ImageIcon, TrashIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/components/providers/language-provider";

const OUT_W = 600; // canvas output width
const OUT_H = 900; // canvas output height — 2:3 book aspect (width:height)
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

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
  const [editorBlob, setEditorBlob] = useState<Blob | null>(null);
  const [previewTimestamp, setPreviewTimestamp] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const coverSrc = coverUrl
    ? `/api/books/${bookId}/cover?ts=${previewTimestamp}`
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
    // UDG round-8 (Igor): pre-checks passed — open the inline crop editor instead of
    // uploading directly; the cropped result is what gets saved.
    setEditorBlob(file);
  }

  /** PUT the baked-crop JPEG data URL to /api/books/:id/cover. */
  async function applyCropToCover(dataUrl: string): Promise<void> {
    setUploading(true);
    try {
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
      setEditorBlob(null);
      toast.success(t.bookSettings.coverSaved);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "upload-failed"
          ? error.message
          : t.bookSettings.coverError
      );
      throw error; // propagate so the editor can stay open for a retry
    } finally {
      setUploading(false);
    }
  }

  /** Grab the existing cover bytes from GET /api/books/:id/cover and open the editor. */
  async function recropExisting() {
    setUploading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/cover`);
      if (!res.ok) throw new Error("load-failed");
      setEditorBlob(await res.blob());
    } catch {
      toast.error(t.bookSettings.coverError);
    } finally {
      setUploading(false);
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
          {t.bookSettings.coverUpload}
        </Button>
        {coverUrl ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => void recropExisting()}
            className="gap-1 self-start"
          >
            <CropIcon className="size-4" />
            {t.bookSettings.coverRecrop}
          </Button>
        ) : null}
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
      {editorBlob ? (
        <CoverCropDialog
          blob={editorBlob}
          disabled={disabled}
          uploading={uploading}
          onOpenChange={(open) => {
            if (!open) setEditorBlob(null);
          }}
          onApply={(dataUrl) => applyCropToCover(dataUrl)}
        />
      ) : null}
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

/**
 * Inline crop/position editor. Renders the source image offset/scaled so the user
 * sees a live, clamped 2:3 frame, then applies the visible region to a 600x900
 * canvas and returns a JPEG data URL via onApply.
 */
function CoverCropDialog({
  blob,
  disabled,
  uploading,
  onApply,
  onOpenChange,
}: {
  blob: Blob;
  disabled: boolean;
  uploading: boolean;
  onApply: (dataUrl: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [posH, setPosH] = useState(0.5);
  const [posV, setPosV] = useState(0.5);
  const [applying, setApplying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Decode the blob for drawing; open the editor only once we have usable pixels.
  useEffect(() => {
    let cancelled = false;
    if (typeof createImageBitmap !== "function") {
      toast.error(t.bookSettings.coverError);
      return;
    }
    createImageBitmap(blob)
      .then((bmp) => {
        if (cancelled) {
          bmp.close?.();
          return;
        }
        setBitmap(bmp);
        setDims({ w: bmp.width, h: bmp.height });
      })
      .catch(() => {
        if (!cancelled) toast.error(t.bookSettings.coverError);
      });
    return () => {
      cancelled = true;
      // The active bitmap is closed on dialog teardown (below), not here, so a
      // stale closure never releases the one still on screen.
    };
  }, [blob, t]);

  // Close the decoded bitmap when this editor instance unmounts.
  useEffect(() => () => {
    setBitmap((cur) => {
      cur?.close?.();
      return null;
    });
  }, []);

  // Redraw the clamped 2:3 frame into the output canvas whenever any control changes.
  useEffect(() => {
    if (!bitmap || !dims) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Largest 2:3 rectangle that fits the source at zoom 1 (fills the frame).
    const baseW = Math.min(dims.w, dims.h * (2 / 3));
    const vw = baseW / zoom;
    const vh = vw * (3 / 2);
    // Clamp pan so the visible region stays inside the source image (never samples
    // blank pixels beyond the edges); maxX/maxY are held >= 0 so a zoomed window
    // larger than the source degenerates to (0,0).
    const maxX = Math.max(0, dims.w - vw);
    const maxY = Math.max(0, dims.h - vh);
    const sx = posH * maxX;
    const sy = posV * maxY;
    ctx.drawImage(bitmap, sx, sy, vw, vh, 0, 0, OUT_W, OUT_H);
  }, [bitmap, dims, zoom, posH, posV]);

  function encodeCanvasDataUrl() {
    const canvas = canvasRef.current;
    return new Promise<string>((resolve, reject) => {
      if (!canvas) {
        reject(new Error("canvas-missing"));
        return;
      }
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error("encode-failed"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read-failed"));
        reader.readAsDataURL(result);
      }, "image/jpeg", 0.92);
    });
  }

  async function handleApply() {
    setApplying(true);
    try {
      const dataUrl = await encodeCanvasDataUrl();
      await onApply(dataUrl);
    } catch {
      // onApply toasts its own error; keep the editor open so the user can retry.
    } finally {
      setApplying(false);
    }
  }

  const controlsBusy = applying || uploading || disabled;

  return (
    <Dialog open onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t.bookSettings.coverCropTitle}</DialogTitle>
          <DialogDescription>{t.bookSettings.coverCropHint}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto flex flex-col items-center gap-4">
          <div className="relative flex size-56 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {bitmap ? (
              <canvas
                ref={canvasRef}
                width={OUT_W}
                height={OUT_H}
                className="h-56 w-full object-cover rounded-md border shadow-sm"
                aria-label={t.bookSettings.coverPreview}
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="w-full max-w-xs space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label className="font-medium">
                {t.bookSettings.coverCropZoom}
                <span className="ml-1 text-muted-foreground">{zoom.toFixed(2)}x</span>
              </Label>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                disabled={controlsBusy}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="block w-full accent-current disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crop-pos-h" className="font-medium">
                {t.bookSettings.coverCropPositionH}
                <span className="ml-1 text-muted-foreground">{Math.round(posH * 100)}%</span>
              </Label>
              <input
                id="crop-pos-h"
                type="range"
                min={0}
                max={100}
                step={1}
                value={posH * 100}
                disabled={controlsBusy}
                onChange={(e) => setPosH(Number(e.target.value) / 100)}
                className="block w-full accent-current disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crop-pos-v" className="font-medium">
                {t.bookSettings.coverCropPositionV}
                <span className="ml-1 text-muted-foreground">{Math.round(posV * 100)}%</span>
              </Label>
              <input
                id="crop-pos-v"
                type="range"
                min={0}
                max={100}
                step={1}
                value={posV * 100}
                disabled={controlsBusy}
                onChange={(e) => setPosV(Number(e.target.value) / 100)}
                className="block w-full accent-current disabled:opacity-50"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={controlsBusy}
            onClick={() => onOpenChange(false)}
          >
            {t.bookSettings.coverCropCancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={controlsBusy || !bitmap}
            onClick={() => void handleApply()}
            className="gap-1.5"
          >
            <CropIcon className="size-4" aria-hidden="true" />
            {applying ? t.bookSettings.coverUploading : t.bookSettings.coverCropApply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}