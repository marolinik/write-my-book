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

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "sr", name: "Serbian" },
  { code: "hr", name: "Croatian" },
];

export default function SettingsPage() {
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
        Settings
      </h1>
      <p className="text-muted-foreground">
        Manage your API keys and preferences
      </p>

      <Separator className="my-6" />

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Bring Your Own Key (BYOK) — your API keys are encrypted at rest
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddKey(true)}
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              Add Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddKey && (
            <div className="mb-4 space-y-3 rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Provider</Label>
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
                  <Label>Label (optional)</Label>
                  <Input
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder="e.g., Personal key"
                  />
                </div>
              </div>
              <div>
                <Label>API Key</Label>
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
                  {addKey.isPending ? "Validating..." : "Add Key"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAddKey(false)}
                >
                  Cancel
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
                No API keys configured. Add one to start using AI agents.
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
                              Default
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
          <CardTitle>Language Preference</CardTitle>
          <CardDescription>
            Default language for new books and UI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select defaultValue="en">
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
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
            <strong>BYOK (Bring Your Own Key):</strong> WriteMyBook uses your
            API key directly. We never store or have access to your API
            credentials in plaintext — they are encrypted with AES-256-GCM at
            rest. You pay Anthropic directly for token usage.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
