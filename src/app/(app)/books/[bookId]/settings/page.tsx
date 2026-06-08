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
import { ModelPicker } from "@/components/settings/model-picker";
import {
  resolveModelForRole,
  type AgentRole,
  type BookModelSettings,
  AGENT_ROLES,
  getModelDef,
} from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm/providers";

// ── Role descriptions ─────────────────────────────────────────

interface RoleInfo {
  role: AgentRole;
  label: string;
  description: string;
  bookField: string;
}

const ROLE_INFOS: RoleInfo[] = [
  { role: "ghostwriter", label: "Ghostwriter", description: "Writes chapters and plans", bookField: "modelGhostwriter" },
  { role: "editor", label: "Editor", description: "Dev/line editing and revision", bookField: "modelEditor" },
  { role: "beta-reader", label: "Beta Reader", description: "Simulated reader feedback", bookField: "modelBetaReader" },
  { role: "analyst", label: "Analyst", description: "Style, continuity, market analysis", bookField: "modelAnalyst" },
  { role: "coach", label: "Coach", description: "Multi-step workflow orchestration", bookField: "modelCoach" },
  { role: "creative", label: "Creative", description: "Story architecture and scene planning", bookField: "modelCreative" },
];

// ── Resolution source labels ──────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  "book-role": "book role override",
  "book-default": "book default",
  "global-role": "global role override",
  "global-default": "global default",
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
  const availableProviders: ProviderKey[] = useMemo(
    () =>
      (apiKeys ?? [])
        .filter((k) => k.validatedAt != null)
        .map((k) => k.provider as ProviderKey)
        .filter((p, i, arr) => arr.indexOf(p) === i),
    [apiKeys]
  );

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

  const globalDefault = defaultModelData?.defaultModel ?? "anthropic/sonnet";

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

      {/* Model Overrides for this Book */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model Overrides</CardTitle>
          <CardDescription>
            Override the global model selection for this book. &quot;Use
            Default&quot; inherits from your global settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Book Default Model */}
          <ModelPicker
            label="Book Default Model"
            description="Override the global default for all agent roles in this book."
            value={getBookDefaultValue()}
            onChange={(registryId) => handleChange("modelOverride", registryId)}
            availableProviders={availableProviders}
            showDefaultOption
          />

          <Separator />

          {/* Per-Role Overrides */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Per-Role Overrides</h4>
            <p className="text-xs text-muted-foreground">
              Fine-tune which model each agent role uses for this book.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {ROLE_INFOS.map((info) => (
              <ModelPicker
                key={info.role}
                label={info.label}
                description={info.description}
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
              <h4 className="text-sm font-medium">Resolution Preview</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Shows which model will actually be used for each agent role in this book.
            </p>
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
                const source = SOURCE_LABELS[resolved.resolvedFrom] ?? resolved.resolvedFrom;

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
            <AlertTriangleIcon className="size-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions. Please be certain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete this book</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this book and all its chapters, documents, agent sessions, and editorial findings.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2Icon className="mr-1 size-4" />
              Delete Book
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangleIcon className="size-5" />
              Delete Book
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{book?.name ?? "this book"}</strong> and all related data including chapters, documents, agent sessions, and editorial findings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>
              Type <strong>{book?.name ?? "DELETE"}</strong> to confirm:
            </Label>
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
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                deleteConfirmText !== (book?.name ?? "DELETE") ||
                deleteMutation.isPending
              }
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync();
                  toast.success("Book deleted");
                  router.push("/dashboard");
                } catch {
                  toast.error("Failed to delete book");
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2Icon className="mr-1 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
