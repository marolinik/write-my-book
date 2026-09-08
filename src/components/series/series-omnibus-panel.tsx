"use client";

// UDG round-9 (Olivera/Igor): a single series-level control panel for the series
// page — upload/remove the series cover (bound into omnibus exports), export the
// whole series as one omnibus volume (PDF/EPUB/DOCX), and open a printable
// whole-series report. All S3 bytes stay server-side; the manuscript references a
// bare tempdir basename, never an S3 URL.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DownloadIcon, ImageIcon, PrinterIcon, TrashIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSeriesExport } from "@/hooks/use-series";
import { useLanguage } from "@/components/providers/language-provider";

type Format = "pdf" | "epub" | "docx";

export function SeriesOmnibusPanel({
  seriesId,
  coverUrl,
  seriesHasBooks,
}: {
  seriesId: string;
  coverUrl: string | null;
  seriesHasBooks: boolean;
}) {
  const { t } = useLanguage();
  const [format, setFormat] = useState<Format>("pdf");
  const [uploading, setUploading] = useState(false);
  const [previewTs, setPreviewTs] = useState(() => Date.now());
  const [lastExport, setLastExport] = useState<{ filename: string; format: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const exportMutation = useSeriesExport(seriesId);

  const coverSrc = coverUrl ? `/api/series/${seriesId}/cover?ts=${previewTs}` : null;

  async function onCoverSelected(file: File | null) {
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
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read-failed"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/series/${seriesId}/cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "upload-failed");
      setPreviewTs(Date.now());
      toast.success(t.seriesPage.coverSaved);
    } catch {
      toast.error(t.bookSettings.coverError);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeCover() {
    setUploading(true);
    fetch(`/api/series/${seriesId}/cover`, { method: "DELETE" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setPreviewTs(Date.now());
        toast.success(t.seriesPage.coverRemoved);
      })
      .catch(() => toast.error(t.bookSettings.coverError))
      .finally(() => setUploading(false));
  }

  function doExport() {
    exportMutation.mutate(
      { format, isDraft: false },
      {
        onSuccess: (result) => {
          setLastExport({ filename: result.filename, format: result.format });
          toast.success(t.seriesPage.exportDone);
        },
        onError: (e) => toast.error(e.message || t.seriesPage.exportError),
      }
    );
  }

  const printableHref = `/api/series/${seriesId}/report`;

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">{t.seriesPage.omnibusTitle}</CardTitle>
        <CardDescription>{t.seriesPage.omnibusDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Series cover upload */}
        <div className="flex items-start gap-4">
          <div className="relative flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc} alt={t.seriesPage.coverLabel} className="h-full w-full object-cover" />
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
              onChange={(e) => void onCoverSelected(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="gap-1 self-start"
            >
              <UploadIcon className="size-4" />
              {t.seriesPage.coverUpload}
            </Button>
            {coverUrl ? (
              <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={removeCover} className="gap-1 self-start">
                <TrashIcon className="size-4" />
                {t.seriesPage.coverRemove}
              </Button>
            ) : null}
            <p className="max-w-[16rem] text-xs text-muted-foreground">{t.seriesPage.coverHint}</p>
          </div>
        </div>

        <hr className="border-t" />

        {/* Omnibus export */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="epub">EPUB</SelectItem>
              <SelectItem value="docx">DOCX</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={!seriesHasBooks || exportMutation.isPending}
            onClick={doExport}
            className="gap-1"
          >
            <DownloadIcon className="size-4" />
            {exportMutation.isPending ? t.seriesPage.exporting : t.seriesPage.exportOmnibus}
          </Button>
          {lastExport ? (
            <a
              href={`/api/series/${seriesId}/export/${lastExport.filename}`}
              className="text-xs font-medium text-primary underline underline-offset-2"
            >
              ⬇ {lastExport.filename}
            </a>
          ) : null}
        </div>

        {!seriesHasBooks ? (
          <p className="text-xs text-muted-foreground">{t.seriesPage.noBooksForExport}</p>
        ) : null}

        <hr className="border-t" />

        {/* Printable whole-series report (Olivera) */}
        <div className="flex items-center gap-2">
          <a href={printableHref} target="_blank" rel="noopener noreferrer">
            <Button type="button" size="sm" variant="outline" className="gap-1">
              <PrinterIcon className="size-4" />
              {t.seriesPage.printableReport}
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}