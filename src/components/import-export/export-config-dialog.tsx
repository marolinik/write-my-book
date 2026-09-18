"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExportConfig, useUpdateExportConfig } from "@/hooks/use-export";
import type { ExportConfig } from "@/hooks/use-export";
import { Loader2Icon } from "lucide-react";

interface ExportConfigDialogProps {
  bookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportConfigDialog({
  bookId,
  open,
  onOpenChange,
}: ExportConfigDialogProps) {
  const { t } = useLanguage();
  const { data: config, isLoading } = useExportConfig(bookId);
  const updateConfig = useUpdateExportConfig(bookId);
  const [local, setLocal] = useState<ExportConfig | null>(null);

  useEffect(() => {
    if (config) setLocal(config);
  }, [config]);

  const save = () => {
    if (!local) return;
    updateConfig.mutate(local, {
      onSuccess: () => onOpenChange(false),
    });
  };

  if (isLoading || !local) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.exportConfig.title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="metadata" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="metadata">{t.exportConfig.tabMetadata}</TabsTrigger>
            <TabsTrigger value="front">{t.exportConfig.tabFront}</TabsTrigger>
            <TabsTrigger value="back">{t.exportConfig.tabBack}</TabsTrigger>
            <TabsTrigger value="style">{t.exportConfig.tabStyle}</TabsTrigger>
          </TabsList>

          {/* Metadata */}
          <TabsContent value="metadata" className="space-y-3 pt-2">
            <Field label={t.exportConfig.bookTitle} value={local.metadata.title} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, title: v } })} />
            <Field label={t.exportConfig.subtitle} value={local.metadata.subtitle} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, subtitle: v } })} />
            <Field label={t.exportConfig.author} value={local.metadata.author} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, author: v } })} />
            <Field label={t.exportConfig.seriesName} value={local.metadata.seriesName} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, seriesName: v } })} />
            <Field label="ISBN" value={local.metadata.isbn} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, isbn: v } })} />
            <Field label={t.exportConfig.publisher} value={local.metadata.publisher} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, publisher: v } })} />
            <Field label={t.exportConfig.copyrightYear} value={local.metadata.copyrightYear} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, copyrightYear: v } })} />
            <Field label={t.exportConfig.sceneBreakGlyph} value={local.sceneBreakGlyph} onChange={(v) => setLocal({ ...local, sceneBreakGlyph: v })} />
            <Field label={t.exportConfig.trimSize} value={local.format.trimSize} onChange={(v) => setLocal({ ...local, format: { ...local.format, trimSize: v } })} />
          </TabsContent>

          {/* Front Matter */}
          <TabsContent value="front" className="space-y-3 pt-2">
            <Toggle label={t.exportConfig.coverPage} checked={local.frontMatter.coverPage} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, coverPage: v } })} />
            <Toggle label={t.exportConfig.halfTitlePage} checked={local.frontMatter.halfTitle} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, halfTitle: v } })} />
            <Toggle label={t.exportConfig.titlePage} checked={local.frontMatter.titlePage} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, titlePage: v } })} />
            <Toggle label={t.exportConfig.copyrightPage} checked={local.frontMatter.copyrightPage} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, copyrightPage: v } })} />
            <Toggle label={t.exportConfig.dedication} checked={local.frontMatter.dedication} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, dedication: v } })} />
            <Toggle label={t.exportConfig.tableOfContents} checked={local.frontMatter.tableOfContents} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, tableOfContents: v } })} />
            <Field label={t.exportConfig.coverImagePath} value={local.frontMatter.coverImagePath} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, coverImagePath: v } })} />
            <Field label={t.exportConfig.dedicationPath} value={local.frontMatter.dedicationPath} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, dedicationPath: v } })} />
          </TabsContent>

          {/* Back Matter */}
          <TabsContent value="back" className="space-y-3 pt-2">
            <Toggle label={t.exportConfig.aboutAuthor} checked={local.backMatter.aboutAuthor} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, aboutAuthor: v } })} />
            <Field label={t.exportConfig.aboutAuthorPath} value={local.backMatter.aboutAuthorPath} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, aboutAuthorPath: v } })} />
            <Toggle label={t.exportConfig.alsoBy} checked={local.backMatter.alsoBy} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, alsoBy: v } })} />
            <Field label={t.exportConfig.alsoByPath} value={local.backMatter.alsoByPath} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, alsoByPath: v } })} />
            <Toggle label={t.exportConfig.acknowledgments} checked={local.backMatter.acknowledgments} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, acknowledgments: v } })} />
            <Field label={t.exportConfig.acknowledgmentsPath} value={local.backMatter.acknowledgmentsPath} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, acknowledgmentsPath: v } })} />
          </TabsContent>

          {/* Style */}
          <TabsContent value="style" className="space-y-3 pt-2">
            <Toggle label={t.exportConfig.oxfordComma} checked={local.styleGuide.oxfordComma} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, oxfordComma: v } })} />
            <Toggle label={t.exportConfig.spellOutNumbers} checked={local.styleGuide.spellOutNumbers} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, spellOutNumbers: v } })} />
            <Toggle label={t.exportConfig.closedEmDashes} checked={local.styleGuide.closedEmDashes} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, closedEmDashes: v } })} />
            <Toggle label={t.exportConfig.thinSpaceEllipsis} checked={local.styleGuide.thinSpaceEllipsis} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, thinSpaceEllipsis: v } })} />
            <Toggle label={t.exportConfig.autoHyphenation} checked={local.typography.autoHyphenation} onChange={(v) => setLocal({ ...local, typography: { ...local.typography, autoHyphenation: v } })} />
            <Toggle label={t.exportConfig.justifiedText} checked={local.typography.justifiedText} onChange={(v) => setLocal({ ...local, typography: { ...local.typography, justifiedText: v } })} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
