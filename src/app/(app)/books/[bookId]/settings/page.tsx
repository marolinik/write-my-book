"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useBookSettings, useUpdateBookSettings } from "@/hooks/use-settings";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export default function BookSettingsPage() {
  const router = useRouter();
  const { bookId } = useParams<{ bookId: string }>();
  const { data: settings, isLoading } = useBookSettings(bookId);
  const updateSettings = useUpdateBookSettings(bookId);

  async function handleChange(field: string, value: unknown) {
    try {
      await updateSettings.mutateAsync({ [field]: value });
      toast.success("Settings updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Settings not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Book Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure AI models and writing preferences
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          Back
        </Button>
      </div>

      {/* AI Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Models</CardTitle>
          <CardDescription>
            Choose which Claude model each agent uses
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ghostwriter</Label>
            <p className="text-xs text-muted-foreground">Writes chapter drafts</p>
            <Select
              value={settings.modelGhostwriter}
              onValueChange={(v) => handleChange("modelGhostwriter", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="sonnet">Sonnet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Coach</Label>
            <p className="text-xs text-muted-foreground">Writing coach & story bible</p>
            <Select
              value={settings.modelCoach}
              onValueChange={(v) => handleChange("modelCoach", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="sonnet">Sonnet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Creative</Label>
            <p className="text-xs text-muted-foreground">Style, architecture & planning</p>
            <Select
              value={settings.modelCreative}
              onValueChange={(v) => handleChange("modelCreative", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="sonnet">Sonnet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Editor</Label>
            <p className="text-xs text-muted-foreground">Dev edit, line edit & continuity</p>
            <Select
              value={settings.modelEditor}
              onValueChange={(v) => handleChange("modelEditor", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="sonnet">Sonnet</SelectItem>
                <SelectItem value="haiku">Haiku</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Beta Reader</Label>
            <p className="text-xs text-muted-foreground">Simulated reader panel</p>
            <Select
              value={settings.modelBetaReader}
              onValueChange={(v) => handleChange("modelBetaReader", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="sonnet">Sonnet</SelectItem>
                <SelectItem value="haiku">Haiku</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Research</Label>
            <p className="text-xs text-muted-foreground">Manuscript, market & publishing</p>
            <Select
              value={settings.modelResearch}
              onValueChange={(v) => handleChange("modelResearch", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">Opus</SelectItem>
                <SelectItem value="sonnet">Sonnet</SelectItem>
                <SelectItem value="haiku">Haiku</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Analyst</Label>
            <p className="text-xs text-muted-foreground">Statistics & readability</p>
            <Select
              value={settings.modelAnalyst}
              onValueChange={(v) => handleChange("modelAnalyst", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sonnet">Sonnet</SelectItem>
                <SelectItem value="haiku">Haiku</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Style Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Style</CardTitle>
          <CardDescription>
            Control how strictly AI follows your writing style
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Style Strictness</Label>
            <Select
              value={settings.styleStrictness}
              onValueChange={(v) => handleChange("styleStrictness", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="relaxed">Relaxed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-commit</Label>
              <p className="text-xs text-muted-foreground">
                Automatically save agent changes
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
          <CardTitle className="text-base">Beta Reader Panel</CardTitle>
          <CardDescription>
            Configure virtual beta reader settings
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Panel Size</Label>
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
            <Label>Consensus %</Label>
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
            <Label>Convergence %</Label>
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
    </div>
  );
}
