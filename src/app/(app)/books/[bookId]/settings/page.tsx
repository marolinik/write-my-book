"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2Icon, AlertTriangleIcon, Loader2Icon, InfoIcon } from "lucide-react";
import { toast } from "sonner";

import { useBookSettings } from "@/hooks/use-settings";
import { useBook, useDeleteBook } from "@/hooks/use-books";
import { useDebouncedSettings } from "@/hooks/use-debounced-settings";
import { useDefaultModel } from "@/hooks/use-default-model";
import { useApiKeys } from "@/hooks/use-api-keys";
import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CoverUploader } from "@/components/book/cover-uploader";
import { BackCoverUploader } from "@/components/book/back-cover-uploader";
import { ModelPicker } from "@/components/settings/model-picker";
import {
  resolveModelForRole,
  type AgentRole,
  type BookModelSettings,
  AGENT_ROLES,
  getModelDef,
} from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm/providers";
import { getDefaultModelId } from "@/lib/llm/defaults";
import { BookDetailsSection } from "@/components/settings/book-details-section";

// ── Role descriptions ─────────────────────────────────────────

interface RoleInfo {
  role: AgentRole;
  label: (t: UIStrings) => string;
  description: (t: UIStrings) => string;
  bookField: string;
}

/** The role's name and its one-line job, both from `bookSettings`. */
const ROLE_INFOS: RoleInfo[] = [
  { role: "ghostwriter", label: (t) => t.bookSettings.ghostwriter, description: (t) => t.bookSettings.ghostwriterDesc, bookField: "modelGhostwriter" },
  { role: "editor", label: (t) => t.bookSettings.editor, description: (t) => t.bookSettings.editorDesc, bookField: "modelEditor" },
  { role: "beta-reader", label: (t) => t.bookSettings.betaReader, description: (t) => t.bookSettings.betaReaderDesc, bookField: "modelBetaReader" },
  { role: "analyst", label: (t) => t.bookSettings.analyst, description: (t) => t.bookSettings.analystDesc, bookField: "modelAnalyst" },
  { role: "coach", label: (t) => t.bookSettings.coach, description: (t) => t.bookSettings.coachDesc, bookField: "modelCoach" },
  { role: "creative", label: (t) => t.bookSettings.creative, description: (t) => t.bookSettings.creativeDesc, bookField: "modelCreative" },
];

// ── Resolution source labels ──────────────────────────────────

const SOURCE_LABELS: Record<string, (t: UIStrings) => string> = {
  "book-role": (t) => t.bookSettings.sourceBookRole,
  "book-default": (t) => t.bookSettings.sourceBookDefault,
  "global-role": (t) => t.bookSettings.sourceGlobalRole,
  "global-default": (t) => t.bookSettings.sourceGlobalDefault,
};

export default function BookSettingsPage() {
  const router = useRouter();
  const { bookId } = useParams<{ bookId: string }>();
  const { data: settings, isLoading } = useBookSettings(bookId);
  const { data: book } = useBook(bookId);
  const { data: defaultModelData } = useDefaultModel();
  const { data: apiKeys } = useApiKeys();
  const handleChange = useDebouncedSettings(bookId);
  const deleteMutation = useDeleteBook(bookId);
  const { t } = useLanguage();
  const s = t.bookSettings;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Derive available providers from user's validated keys
  const availableProviders: ProviderKey[] = useMemo(() => {
    const fromKeys = (apiKeys ?? [])
      .filter((k) => k.validatedAt != null)
      .map((k) => k.provider as ProviderKey)
      .filter((p, i, arr) => arr.indexOf(p) === i);
    // Keyless self-hosted fleet — see model-selection-section.tsx.
    if (defaultModelData?.localFleet === true) {
      fromKeys.push("local" as ProviderKey);
    }
    return fromKeys;
  }, [apiKeys, defaultModelData?.localFleet]);

  // Build resolution chain inputs for preview
  const bookModelSettings: BookModelSettings | null = useMemo(() => {
    if (!settings) return null;
    return {
      modelGhostwriter: settings.modelGhostwriter,
      modelEditor: settings.modelEditor,
      modelBetaReader: settings.modelBetaReader,
      modelAnalyst: settings.modelAnalyst,
      modelCoach: settings.modelCoach,
      modelCreative: settings.modelCreative,
      modelOverride: settings.modelOverride,
    };
  }, [settings]);

  const globalRoleOverrides: Record<AgentRole, string | null> = useMemo(
    () => ({
      ghostwriter: defaultModelData?.modelGhostwriter ?? null,
      editor: defaultModelData?.modelEditor ?? null,
      "beta-reader": defaultModelData?.modelBetaReader ?? null,
      analyst: defaultModelData?.modelAnalyst ?? null,
      coach: defaultModelData?.modelCoach ?? null,
      creative: defaultModelData?.modelCreative ?? null,
    }),
    [defaultModelData]
  );

  const globalDefault = defaultModelData?.defaultModel ?? getDefaultModelId();

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">{t.common.error}</p>
      </div>
    );
  }

  /** Check if a value is a real registry ID override (not old tier like "opus"/"sonnet"/"haiku"/"default"/""). */
  const isRegistryId = (val: string | null | undefined): boolean => {
    if (!val || val === "default") return false;
    return val.includes("/");
  };

  /** Get the ModelPicker value for a book-level role field. null means "use default". */
  const getBookRoleValue = (field: string): string | null => {
    const s2 = settings!; // always called after null check above
    const val = (s2 as unknown as Record<string, string>)[field];
    // Old tier values like "opus", "sonnet", "haiku" are NOT valid registry IDs
    // Treat them as "use default" for the new model picker
    if (!isRegistryId(val)) return null;
    return val;
  };

  /** Get the ModelPicker value for book-level default. */
  const getBookDefaultValue = (): string | null => {
    const s2 = settings!; // always called after null check above
    return s2.modelOverride && isRegistryId(s2.modelOverride)
      ? s2.modelOverride
      : null;
  };

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{s.title}</h1>
          <p className="text-sm text-muted-foreground">{s.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          {s.back}
        </Button>
      </div>

      {/* Title + language. Both were setup-wizard-only, so a typo in the title
          was permanent and a book stuck on the wrong language kept producing
          documents in it (the agents read Book.language). */}
      <BookDetailsSection bookId={bookId} />

      {/* UDG round-5 (Igor): real book-cover upload — stored in the book's S3
          bucket (Book.coverUrl), bound into export front matter by the pipeline.
          This is a client component so it can post base64 + show a live preview. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.coverTitle}</CardTitle>
          <CardDescription>{s.coverTitleDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <CoverUploader bookId={bookId} coverUrl={book?.coverUrl ?? null} />
        </CardContent>
      </Card>

      {/* UDG round-8 (Igor/Olivera): back cover — bound into exports as a trailing
          back-cover page (EPUB/PDF). Stored as Book.backCoverUrl in the book's S3 bucket. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.backCoverTitle}</CardTitle>
          <CardDescription>{s.backCoverTitleDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <BackCoverUploader bookId={bookId} backCoverUrl={book?.backCoverUrl ?? null} />
        </CardContent>
      </Card>

      {/* Model Overrides for this Book */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.screens.modelOverrides}</CardTitle>
          <CardDescription>
            {t.pagesUI.modelOverridesHint}
          </CardDescription>
          {/* UDG round-6 (Sofija): config-only reassurance — these presets never
              touch manuscript/document content. */}
          <p className="text-xs text-muted-foreground">{s.configOnlyNote}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Book Default Model */}
          <ModelPicker
            label={t.screens.bookDefaultModel}
            description={t.screens.bookDefaultModelDesc}
            value={getBookDefaultValue()}
            onChange={(registryId) => handleChange("modelOverride", registryId)}
            availableProviders={availableProviders}
            showDefaultOption
          />

          <Separator />

          {/* Per-Role Overrides */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium">{t.screens.perRoleOverrides}</h4>
            <p className="text-xs text-muted-foreground">{t.bookSettings.modelPerRoleHint}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {ROLE_INFOS.map((info) => (
              <ModelPicker
                key={info.role}
                label={info.label(t)}
                description={info.description(t)}
                value={getBookRoleValue(info.bookField)}
                onChange={(registryId) =>
                  handleChange(info.bookField, registryId ?? "default")
                }
                availableProviders={availableProviders}
                showDefaultOption
              />
            ))}
          </div>

          <Separator />

          {/* Resolution Chain Preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <InfoIcon className="size-3.5 text-muted-foreground" />
              <h4 className="text-sm font-medium">{t.screens.resolutionPreview}</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t.bookSettings.effectiveModelHint}</p>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              {AGENT_ROLES.map((role) => {
                const resolved = resolveModelForRole(
                  role,
                  bookModelSettings,
                  globalRoleOverrides,
                  globalDefault
                );
                const displayName =
                  getModelDef(resolved.registryId)?.displayName ??
                  resolved.registryId;
                const source = SOURCE_LABELS[resolved.resolvedFrom]?.(t) ?? resolved.resolvedFrom;

                return (
                  <div
                    key={role}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-medium capitalize">{role}</span>
                    <span className="text-muted-foreground">
                      {displayName}{" "}
                      <span className="text-[10px]">({source})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Style Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.styleSection}</CardTitle>
          <CardDescription>{s.styleDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{s.styleStrictness}</Label>
            <Select
              value={settings.styleStrictness}
              onValueChange={(v) => handleChange("styleStrictness", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">{s.strict}</SelectItem>
                <SelectItem value="balanced">{s.balanced}</SelectItem>
                <SelectItem value="relaxed">{s.relaxed}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>{s.autoCommit}</Label>
              <p className="text-xs text-muted-foreground">
                {s.autoCommitDesc}
              </p>
            </div>
            <Switch
              checked={settings.autoCommit}
              onCheckedChange={(v) => handleChange("autoCommit", v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>{s.synopsisForLineEdit}</Label>
              <p className="text-xs text-muted-foreground">
                {s.synopsisForLineEditDesc}
              </p>
            </div>
            <Switch
              checked={settings.synopsisForLineEdit}
              onCheckedChange={(v) => handleChange("synopsisForLineEdit", v)}
            />
          </div>

          <div className="space-y-2">
            <Label>{s.lineEditorProfile}</Label>
            <p className="text-xs text-muted-foreground">
              {s.lineEditorProfileDesc}
            </p>
            <Select
              value={settings.lineEditorProfile}
              onValueChange={(v) => handleChange("lineEditorProfile", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">{s.profileStandard}</SelectItem>
                <SelectItem value="developmental">{s.profileDevelopmental}</SelectItem>
                <SelectItem value="go_pub">{s.profileGoPub}</SelectItem>
                <SelectItem value="spare">{s.profileSpare}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Beta Reader Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.betaPanel}</CardTitle>
          <CardDescription>{s.betaPanelDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{s.panelSize}</Label>
            <Input
              type="number"
              min={3}
              max={10}
              value={settings.betaPanelSize}
              onChange={(e) =>
                handleChange("betaPanelSize", parseInt(e.target.value) || 10)
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{s.consensus}</Label>
            <Input
              type="number"
              min={50}
              max={100}
              value={settings.betaConsensus}
              onChange={(e) =>
                handleChange("betaConsensus", parseInt(e.target.value) || 80)
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{s.convergence}</Label>
            <Input
              type="number"
              min={50}
              max={100}
              value={settings.betaConvergence}
              onChange={(e) =>
                handleChange(
                  "betaConvergence",
                  parseInt(e.target.value) || 70
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangleIcon className="size-4" />{t.bookSettings.dangerZone}</CardTitle>
          <CardDescription>{t.bookSettings.dangerZoneHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t.screens.deleteBook}</p>
              <p className="text-xs text-muted-foreground">{t.bookSettings.deleteBookHint}</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2Icon className="mr-1 size-4" />{t.bookSettings.deleteBook}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangleIcon className="size-5" />{t.bookSettings.deleteBook}</DialogTitle>
            <DialogDescription>{t.bookSettings.deleteConfirmIntro}<strong>{book?.name ?? t.bookSettings.thisBook}</strong>{t.bookSettings.deleteConfirmRest}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t.bookSettings.typeLabel}<strong>{book?.name ?? "DELETE"}</strong>{t.bookSettings.toConfirm}</Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={book?.name ?? "DELETE"}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmText("");
              }}
            >{t.common.cancel}</Button>
            <Button
              variant="destructive"
              disabled={
                deleteConfirmText !== (book?.name ?? "DELETE") ||
                deleteMutation.isPending
              }
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync();
                  toast.success(t.toasts.bookDeleted);
                  router.push("/dashboard");
                } catch {
                  toast.error(t.toasts.bookDeleteFailed);
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2Icon className="mr-1 size-4 animate-spin" />{t.bookSettings.deleting}</>
              ) : (
                t.bookSettings.deletePermanently
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
