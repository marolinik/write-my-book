"use client";

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
          <DialogTitle>Export Configuration</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="metadata" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="front">Front Matter</TabsTrigger>
            <TabsTrigger value="back">Back Matter</TabsTrigger>
            <TabsTrigger value="style">Style</TabsTrigger>
          </TabsList>

          {/* Metadata */}
          <TabsContent value="metadata" className="space-y-3 pt-2">
            <Field label="Title" value={local.metadata.title} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, title: v } })} />
            <Field label="Subtitle" value={local.metadata.subtitle} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, subtitle: v } })} />
            <Field label="Author" value={local.metadata.author} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, author: v } })} />
            <Field label="Series Name" value={local.metadata.seriesName} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, seriesName: v } })} />
            <Field label="ISBN" value={local.metadata.isbn} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, isbn: v } })} />
            <Field label="Publisher" value={local.metadata.publisher} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, publisher: v } })} />
            <Field label="Copyright Year" value={local.metadata.copyrightYear} onChange={(v) => setLocal({ ...local, metadata: { ...local.metadata, copyrightYear: v } })} />
            <Field label="Scene Break Glyph" value={local.sceneBreakGlyph} onChange={(v) => setLocal({ ...local, sceneBreakGlyph: v })} />
            <Field label="Trim Size" value={local.format.trimSize} onChange={(v) => setLocal({ ...local, format: { ...local.format, trimSize: v } })} />
          </TabsContent>

          {/* Front Matter */}
          <TabsContent value="front" className="space-y-3 pt-2">
            <Toggle label="Cover Page" checked={local.frontMatter.coverPage} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, coverPage: v } })} />
            <Toggle label="Half-Title Page" checked={local.frontMatter.halfTitle} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, halfTitle: v } })} />
            <Toggle label="Title Page" checked={local.frontMatter.titlePage} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, titlePage: v } })} />
            <Toggle label="Copyright Page" checked={local.frontMatter.copyrightPage} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, copyrightPage: v } })} />
            <Toggle label="Dedication" checked={local.frontMatter.dedication} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, dedication: v } })} />
            <Toggle label="Table of Contents" checked={local.frontMatter.tableOfContents} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, tableOfContents: v } })} />
            <Field label="Cover Image Path" value={local.frontMatter.coverImagePath} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, coverImagePath: v } })} />
            <Field label="Dedication Path" value={local.frontMatter.dedicationPath} onChange={(v) => setLocal({ ...local, frontMatter: { ...local.frontMatter, dedicationPath: v } })} />
          </TabsContent>

          {/* Back Matter */}
          <TabsContent value="back" className="space-y-3 pt-2">
            <Toggle label="About the Author" checked={local.backMatter.aboutAuthor} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, aboutAuthor: v } })} />
            <Field label="About Author Path" value={local.backMatter.aboutAuthorPath} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, aboutAuthorPath: v } })} />
            <Toggle label="Also By" checked={local.backMatter.alsoBy} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, alsoBy: v } })} />
            <Field label="Also By Path" value={local.backMatter.alsoByPath} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, alsoByPath: v } })} />
            <Toggle label="Acknowledgments" checked={local.backMatter.acknowledgments} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, acknowledgments: v } })} />
            <Field label="Acknowledgments Path" value={local.backMatter.acknowledgmentsPath} onChange={(v) => setLocal({ ...local, backMatter: { ...local.backMatter, acknowledgmentsPath: v } })} />
          </TabsContent>

          {/* Style */}
          <TabsContent value="style" className="space-y-3 pt-2">
            <Toggle label="Oxford Comma" checked={local.styleGuide.oxfordComma} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, oxfordComma: v } })} />
            <Toggle label="Spell Out Numbers Under Ten" checked={local.styleGuide.spellOutNumbers} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, spellOutNumbers: v } })} />
            <Toggle label="Closed Em-Dashes" checked={local.styleGuide.closedEmDashes} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, closedEmDashes: v } })} />
            <Toggle label="Thin-Space Ellipsis" checked={local.styleGuide.thinSpaceEllipsis} onChange={(v) => setLocal({ ...local, styleGuide: { ...local.styleGuide, thinSpaceEllipsis: v } })} />
            <Toggle label="Auto-Hyphenation" checked={local.typography.autoHyphenation} onChange={(v) => setLocal({ ...local, typography: { ...local.typography, autoHyphenation: v } })} />
            <Toggle label="Justified Text" checked={local.typography.justifiedText} onChange={(v) => setLocal({ ...local, typography: { ...local.typography, justifiedText: v } })} />
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
