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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlusIcon, Pencil, Trash2, X } from "lucide-react";
import { useCreateLens, useUpdateLens, useDeleteLens } from "@/hooks/use-style";

interface CharacterLens {
  id: string;
  characterName: string;
  sensoryPriority: string;
  metaphorDomain: string;
  interiorStyle: string;
  vocabularyRegister: string;
  blindSpots?: string | null;
}

const EMPTY_FORM = {
  characterName: "",
  sensoryPriority: "",
  metaphorDomain: "",
  interiorStyle: "",
  vocabularyRegister: "",
  blindSpots: "",
};

export function CharacterLensEditor({
  bookId,
  lenses,
}: {
  bookId: string;
  lenses: CharacterLens[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const createLens = useCreateLens(bookId);
  const updateLens = useUpdateLens(bookId);
  const deleteLens = useDeleteLens(bookId);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(lens: CharacterLens) {
    setForm({
      characterName: lens.characterName,
      sensoryPriority: lens.sensoryPriority,
      metaphorDomain: lens.metaphorDomain,
      interiorStyle: lens.interiorStyle,
      vocabularyRegister: lens.vocabularyRegister,
      blindSpots: lens.blindSpots ?? "",
    });
    setEditingId(lens.id);
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit() {
    if (editingId) {
      await updateLens.mutateAsync({ lensId: editingId, ...form });
    } else {
      await createLens.mutateAsync(form);
    }
    cancel();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Character Lenses</h3>
          <p className="text-sm text-muted-foreground">
            Two-Layer Voice Model for POV character differentiation
          </p>
        </div>
        <Button onClick={startCreate} size="sm" variant="outline">
          <PlusIcon className="mr-1 h-4 w-4" />
          Add Lens
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "Edit Character Lens" : "New Character Lens"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="characterName">Character Name</Label>
              <Input
                id="characterName"
                value={form.characterName}
                onChange={(e) => setForm({ ...form, characterName: e.target.value })}
                placeholder="e.g., Elena"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sensoryPriority">Sensory Priority</Label>
                <Input
                  id="sensoryPriority"
                  value={form.sensoryPriority}
                  onChange={(e) => setForm({ ...form, sensoryPriority: e.target.value })}
                  placeholder="e.g., visual, tactile"
                />
              </div>
              <div>
                <Label htmlFor="metaphorDomain">Metaphor Domain</Label>
                <Input
                  id="metaphorDomain"
                  value={form.metaphorDomain}
                  onChange={(e) => setForm({ ...form, metaphorDomain: e.target.value })}
                  placeholder="e.g., mechanical, natural"
                />
              </div>
              <div>
                <Label htmlFor="interiorStyle">Interior Style</Label>
                <Input
                  id="interiorStyle"
                  value={form.interiorStyle}
                  onChange={(e) => setForm({ ...form, interiorStyle: e.target.value })}
                  placeholder="e.g., analytical, stream-of-consciousness"
                />
              </div>
              <div>
                <Label htmlFor="vocabularyRegister">Vocabulary Register</Label>
                <Input
                  id="vocabularyRegister"
                  value={form.vocabularyRegister}
                  onChange={(e) => setForm({ ...form, vocabularyRegister: e.target.value })}
                  placeholder="e.g., formal, colloquial"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="blindSpots">Blind Spots (optional)</Label>
              <Textarea
                id="blindSpots"
                value={form.blindSpots}
                onChange={(e) => setForm({ ...form, blindSpots: e.target.value })}
                placeholder="Things this POV character wouldn't notice or care about"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={submit}
                disabled={createLens.isPending || updateLens.isPending || !form.characterName}
                size="sm"
              >
                {editingId ? "Update" : "Create"}
              </Button>
              <Button onClick={cancel} variant="ghost" size="sm">
                <X className="mr-1 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lenses.length === 0 && !showForm ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No character lenses defined yet. Add one to differentiate POV voices.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {lenses.map((lens) => (
            <Card key={lens.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{lens.characterName}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">Sensory: {lens.sensoryPriority}</Badge>
                      <Badge variant="outline">Metaphor: {lens.metaphorDomain}</Badge>
                      <Badge variant="outline">Interior: {lens.interiorStyle}</Badge>
                      <Badge variant="outline">Register: {lens.vocabularyRegister}</Badge>
                    </div>
                    {lens.blindSpots && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Blind spots: {lens.blindSpots}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(lens)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteLens.mutate(lens.id)}
                      disabled={deleteLens.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
