"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useBookSettings, useUpdateBookSettings } from "@/hooks/use-settings";
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
  const { t } = useLanguage();
  const s = t.bookSettings;

  async function handleChange(field: string, value: unknown) {
    try {
      await updateSettings.mutateAsync({ [field]: value });
      toast.success(t.common.save);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

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

      {/* AI Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.aiModels}</CardTitle>
          <CardDescription>{s.aiModelsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{s.ghostwriter}</Label>
            <p className="text-xs text-muted-foreground">{s.ghostwriterDesc}</p>
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
            <Label>{s.coach}</Label>
            <p className="text-xs text-muted-foreground">{s.coachDesc}</p>
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
            <Label>{s.creative}</Label>
            <p className="text-xs text-muted-foreground">{s.creativeDesc}</p>
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
            <Label>{s.editor}</Label>
            <p className="text-xs text-muted-foreground">{s.editorDesc}</p>
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
            <Label>{s.betaReader}</Label>
            <p className="text-xs text-muted-foreground">{s.betaReaderDesc}</p>
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
            <Label>{s.research}</Label>
            <p className="text-xs text-muted-foreground">{s.researchDesc}</p>
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
            <Label>{s.analyst}</Label>
            <p className="text-xs text-muted-foreground">{s.analystDesc}</p>
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
    </div>
  );
}
