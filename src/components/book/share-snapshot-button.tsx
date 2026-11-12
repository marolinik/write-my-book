"use client";

// UDG round-7 (Luka 12): create + copy an account-less share link for a snapshot.
// P1-27: the button opens a dialog where the writer picks the link's lifetime
// (30 days by default), sees every live link for the book and revokes any of
// them. Before this a link never expired and could not be revoked in the app.
import { useState } from "react";
import { toast } from "sonner";
import { Share2Icon, Trash2Icon, Loader2Icon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { fetchJson } from "@/lib/api-client";
import { describeApiError } from "@/lib/api/describe-api-error";

type Lifetime = "7" | "30" | "90" | "never";

interface ShareLink {
  id: string;
  tokenTail: string;
  kind: string;
  createdAt: string;
  expiresAt: string | null;
  lastViewedAt: string | null;
}

interface ShareSnapshotButtonProps {
  bookId: string;
  kind?: "book" | "editorial";
}

export function ShareSnapshotButton({ bookId, kind = "book" }: ShareSnapshotButtonProps) {
  const { t } = useLanguage();
  const locale = useLocale();
  const s = t.snapshot;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lifetime, setLifetime] = useState<Lifetime>("30");
  const linksKey = ["share-links", bookId];

  const links = useQuery({
    queryKey: linksKey,
    enabled: open,
    queryFn: () => fetchJson<{ links: ShareLink[] }>(`/api/share?bookId=${encodeURIComponent(bookId)}`),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ url: string }>("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, kind, ttlDays: lifetime === "never" ? null : Number(lifetime) }),
      }),
    onSuccess: async (data) => {
      const url = `${window.location.origin}${data.url}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success(s.sharedLink + "\n" + url);
      await queryClient.invalidateQueries({ queryKey: linksKey });
    },
    onError: (error) => toast.error(describeApiError(error, t)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/share?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(s.linkRevoked);
      await queryClient.invalidateQueries({ queryKey: linksKey });
    },
    onError: (error) => toast.error(describeApiError(error, t)),
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="gap-1 print:hidden">
          <Share2Icon className="size-4" />
          {s.shareLink}
        </Button>
      </DialogTrigger>
      <DialogContent className="print:hidden">
        <DialogHeader>
          <DialogTitle>{s.shareDialogTitle}</DialogTitle>
          <DialogDescription>{s.shareDialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            {s.linkLifetime}
            <select
              value={lifetime}
              onChange={(e) => setLifetime(e.target.value as Lifetime)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="7">{s.lifetime7}</option>
              <option value="30">{s.lifetime30}</option>
              <option value="90">{s.lifetime90}</option>
              <option value="never">{s.lifetimeNever}</option>
            </select>
          </label>
          <Button type="button" size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2Icon className="size-4 animate-spin" />}
            {s.createAndCopy}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{s.activeLinks}</p>
          {links.isError && <p className="text-xs text-destructive">{describeApiError(links.error, t)}</p>}
          {links.data && links.data.links.length === 0 && (
            <p className="text-xs text-muted-foreground">{s.noActiveLinks}</p>
          )}
          <ul className="space-y-2">
            {links.data?.links.map((link) => (
              <li key={link.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">
                    {link.kind === "editorial" ? s.editorialBrief : s.title} · …{link.tokenTail}
                  </p>
                  <p className="text-muted-foreground">
                    {link.expiresAt ? s.expiresOn.replace("{date}", formatDate(link.expiresAt)) : s.neverExpires}
                    {" · "}
                    {link.lastViewedAt ? s.lastOpened.replace("{date}", formatDate(link.lastViewedAt)) : s.notOpenedYet}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(link.id)}
                  className="gap-1 text-destructive"
                >
                  <Trash2Icon className="size-3.5" />
                  {s.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
