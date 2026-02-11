"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditHistory } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";

interface EditHistoryTimelineProps {
  bookId: string;
}

function actionBadge(actionType: string) {
  switch (actionType) {
    case "apply":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          apply
        </Badge>
      );
    case "dismiss":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          dismiss
        </Badge>
      );
    case "undo":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          undo
        </Badge>
      );
    case "session_complete":
      return (
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
          session complete
        </Badge>
      );
    default:
      return <Badge variant="secondary">{actionType}</Badge>;
  }
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EditHistoryTimeline({ bookId }: EditHistoryTimelineProps) {
  const selectedChapter = useEditorialStore((s) => s.selectedChapter);
  const { data, isLoading } = useEditHistory(
    bookId,
    selectedChapter ?? undefined
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const actions = data?.actions ?? [];

  if (actions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No edit history yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="relative space-y-0 p-4 pl-8">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />

        {actions.map((action) => (
          <div key={action.id} className="relative flex gap-3 pb-6">
            {/* Dot */}
            <div className="absolute -left-[13px] top-1.5 size-2.5 rounded-full border-2 border-primary bg-background" />

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(action.timestamp)}
                </span>
                {actionBadge(action.actionType)}
              </div>
              <p className="text-sm">{action.description}</p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
