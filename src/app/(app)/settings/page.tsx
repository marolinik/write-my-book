"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KeyIcon,
  PlusIcon,
  Trash2Icon,
  CheckCircleIcon,
  AlertCircleIcon,
} from "lucide-react";
import { useApiKeys, useAddApiKey, useDeleteApiKey } from "@/hooks/use-api-keys";
import { useLanguage } from "@/components/providers/language-provider";
import { useUpdateLanguage } from "@/hooks/use-language";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

export default function SettingsPage() {
  const { language, t } = useLanguage();
  const updateLanguage = useUpdateLanguage();
  const { data: apiKeys, isLoading: keysLoading } = useApiKeys();
  const addKey = useAddApiKey();
  const deleteKey = useDeleteApiKey();

  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState("anthropic");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");

  async function handleAddKey() {
    await addKey.mutateAsync({
      provider: newKeyProvider,
      key: newKeyValue,
      label: newKeyLabel || undefined,
    });
    setShowAddKey(false);
    setNewKeyValue("");
    setNewKeyLabel("");
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t.settings.title}
      </h1>
      <p className="text-muted-foreground">
        {t.settings.subtitle}
      </p>

      <Separator className="my-6" />

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t.settings.apiKeys}</CardTitle>
              <CardDescription>
                {t.settings.apiKeysDescription}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddKey(true)}
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              {t.settings.addKey}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddKey && (
            <div className="mb-4 space-y-3 rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t.settings.provider}</Label>
                  <Select
                    value={newKeyProvider}
                    onValueChange={setNewKeyProvider}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="bedrock">AWS Bedrock</SelectItem>
                      <SelectItem value="vertex">Google Vertex</SelectItem>
                      <SelectItem value="azure">Azure OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t.settings.labelOptional}</Label>
                  <Input
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder="e.g., Personal key"
                  />
                </div>
              </div>
              <div>
                <Label>{t.settings.apiKey}</Label>
                <Input
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="sk-ant-..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddKey}
                  disabled={addKey.isPending || !newKeyValue}
                >
                  {addKey.isPending ? t.settings.validating : t.settings.addKey}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAddKey(false)}
                >
                  {t.settings.cancel}
                </Button>
              </div>
            </div>
          )}

          {keysLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          ) : !apiKeys || apiKeys.length === 0 ? (
            <div className="py-8 text-center">
              <KeyIcon className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t.settings.noKeysTitle}. {t.settings.noKeysDescription}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {apiKeys.map(
                (key: {
                  id: string;
                  provider: string;
                  label: string | null;
                  isDefault: boolean;
                  validatedAt: string | null;
                  maskedKey: string;
                }) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {key.validatedAt ? (
                        <CheckCircleIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircleIcon className="h-4 w-4 text-yellow-500" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">
                            {key.provider}
                          </span>
                          {key.label && (
                            <span className="text-sm text-muted-foreground">
                              — {key.label}
                            </span>
                          )}
                          {key.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              {t.settings.default}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground">
                          {key.maskedKey}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteKey.mutate(key.id)}
                      disabled={deleteKey.isPending}
                    >
                      <Trash2Icon className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Language Preference */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.languagePreference}</CardTitle>
          <CardDescription>
            {t.settings.languageDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={language}
            onValueChange={(val) => updateLanguage.mutate(val)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* BYOK Info */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <CardContent className="py-4">
          <p className="text-sm">
            <strong>{t.settings.byokTitle}</strong> {t.settings.byokDescription}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
