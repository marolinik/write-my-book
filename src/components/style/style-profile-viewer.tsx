"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StyleProfile {
  id: string;
  name: string;
  description?: string | null;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export function StyleProfileViewer({ profiles }: { profiles: StyleProfile[] }) {
  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No style profiles yet. Create one to capture your writing fingerprint.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {profiles.map((profile) => (
        <Card key={profile.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{profile.name}</CardTitle>
              <Badge variant="secondary">
                {new Date(profile.updatedAt).toLocaleDateString()}
              </Badge>
            </div>
            {profile.description && (
              <CardDescription>{profile.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap rounded-md border bg-muted/50 p-4 font-serif text-sm leading-relaxed">
              {profile.fingerprint || "No fingerprint content."}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
