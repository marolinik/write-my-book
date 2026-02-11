"use client";

import { use } from "react";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useStyleProfile } from "@/hooks/use-style";
import { StyleProfileViewer } from "@/components/style/style-profile-viewer";
import { CharacterLensEditor } from "@/components/style/character-lens-editor";

export default function StylePage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const { data, isLoading } = useStyleProfile(bookId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profiles = data?.profiles ?? [];
  const lenses = data?.lenses ?? [];

  return (
    <div className="p-6 lg:p-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Style Profile
      </h1>
      <p className="text-muted-foreground">
        Voice fingerprint and character differentiation
      </p>

      <Separator className="my-6" />

      <StyleProfileViewer profiles={profiles} />

      <Separator className="my-6" />

      <CharacterLensEditor bookId={bookId} lenses={lenses} />
    </div>
  );
}
