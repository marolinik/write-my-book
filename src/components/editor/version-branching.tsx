"use client";

import { useState, useCallback } from "react";
import {
  GitBranchIcon,
  GitMergeIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchJson } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale } from "@/components/providers/language-provider";

/**
 * VB: Git-like Version Branching for Prose.
 * "What if I took the story in a different direction from Ch. 5?"
 * 
 * Creates named branches (alternate timelines) for chapters.
 * Writers can branch, work on alternates, then merge or discard.
 * 
 * Architecture: Each branch is a DocumentVersion with a branch tag.
 * The "main" branch is version 0 / null branch.
 */

interface Branch {
  id: string;
  name: string;
  chapterNumber: number;
  description?: string;
  wordCount: number;
  createdAt: string;
  isActive: boolean;
}

interface VersionBranchingProps {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
}

export function VersionBranching({ bookId, chapterId, chapterNumber }: VersionBranchingProps) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [newBranchName, setNewBranchName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ["branches", bookId, chapterId],
    queryFn: () => fetchJson(`/api/books/${bookId}/chapters/${chapterId}/branches`),
  });

  const createBranch = useMutation({
    mutationFn: () =>
      fetchJson(`/api/books/${bookId}/chapters/${chapterId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBranchName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", bookId, chapterId] });
      setNewBranchName("");
      setShowCreate(false);
      toast.success("Branch created — your alternate timeline awaits!");
    },
    onError: () => toast.error("Failed to create branch"),
  });

  const switchBranch = useMutation({
    mutationFn: (branchId: string) =>
      fetchJson(`/api/books/${bookId}/chapters/${chapterId}/branches/${branchId}/switch`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", bookId, chapterId] });
      toast.success("Switched to branch");
    },
  });

  const mergeBranch = useMutation({
    mutationFn: (branchId: string) =>
      fetchJson(`/api/books/${bookId}/chapters/${chapterId}/branches/${branchId}/merge`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", bookId, chapterId] });
      toast.success("Branch merged into main");
    },
  });

  const deleteBranch = useMutation({
    mutationFn: (branchId: string) =>
      fetchJson(`/api/books/${bookId}/chapters/${chapterId}/branches/${branchId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", bookId, chapterId] });
      toast.success("Branch discarded");
    },
  });

  const activeBranch = branches.find((b) => b.isActive);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
          <GitBranchIcon className="size-3" />
          {activeBranch ? activeBranch.name : "main"}
          {branches.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1 ml-0.5">
              {branches.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitBranchIcon className="size-4" />
            Chapter {chapterNumber} — Branches
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Main branch */}
          <div
            className={`flex items-center gap-2 rounded-md border p-2.5 ${
              !activeBranch ? "ring-2 ring-primary/30 bg-primary/5" : "hover:bg-muted/30"
            }`}
          >
            <GitBranchIcon className="size-4 text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">main</p>
              <p className="text-[10px] text-muted-foreground">Original chapter content</p>
            </div>
            {!activeBranch ? (
              <Badge variant="default" className="text-[9px]">active</Badge>
            ) : (
              <Button
                variant="outline" size="sm" className="h-6 text-[10px]"
                onClick={() => switchBranch.mutate("main")}
              >
                Switch
              </Button>
            )}
          </div>

          {/* Other branches */}
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className={`flex items-center gap-2 rounded-md border p-2.5 ${
                    branch.isActive ? "ring-2 ring-primary/30 bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <GitBranchIcon className="size-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{branch.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {branch.wordCount.toLocaleString(locale)} words &bull;{" "}
                      {new Date(branch.createdAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {branch.isActive ? (
                      <Badge variant="default" className="text-[9px]">active</Badge>
                    ) : (
                      <Button
                        variant="outline" size="sm" className="h-6 text-[10px]"
                        onClick={() => switchBranch.mutate(branch.id)}
                      >
                        Switch
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="size-6"
                      onClick={() => mergeBranch.mutate(branch.id)}
                      title="Merge into main"
                    >
                      <GitMergeIcon className="size-3 text-green-500" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="size-6"
                      onClick={() => deleteBranch.mutate(branch.id)}
                      title="Discard branch"
                    >
                      <TrashIcon className="size-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Create new branch */}
          {showCreate ? (
            <div className="flex gap-2">
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newBranchName.trim() && createBranch.mutate()}
                placeholder="Branch name (e.g., alt-ending)"
                className="h-8 text-xs"
                autoFocus
              />
              <Button
                size="sm" className="h-8 shrink-0"
                onClick={() => createBranch.mutate()}
                disabled={!newBranchName.trim() || createBranch.isPending}
              >
                {createBranch.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <CheckIcon className="size-3" />}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline" size="sm" className="w-full text-xs"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon className="size-3 mr-1" />
              Create Branch — "What if...?"
            </Button>
          )}

          <p className="text-[9px] text-muted-foreground text-center">
            Branches let you explore alternate directions without losing your current version.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
