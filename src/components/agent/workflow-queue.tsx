"use client";

import {
  XIcon,
  PlayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ListIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentSessionStore } from "@/stores/agent-session-store";
import { getWorkflow } from "@/lib/agents/workflows";

interface WorkflowQueueProps {
  onStartQueue: () => void;
  disabled?: boolean;
}

export function WorkflowQueue({ onStartQueue, disabled }: WorkflowQueueProps) {
  const queue = useAgentSessionStore((s) => s.workflowQueue);
  const removeFromQueue = useAgentSessionStore((s) => s.removeFromQueue);
  const reorderQueue = useAgentSessionStore((s) => s.reorderQueue);
  const clearQueue = useAgentSessionStore((s) => s.clearQueue);

  if (queue.length === 0) return null;

  return (
    <div className="border-b px-3 py-2 bg-muted/20">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <ListIcon className="size-3.5" />
          Queue ({queue.length})
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-1.5"
            onClick={clearQueue}
          >
            Clear
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={onStartQueue}
            disabled={disabled}
          >
            <PlayIcon className="size-3" />
            Start All
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {queue.map((item, i) => {
          const wf = getWorkflow(item.workflowId);
          return (
            <div
              key={`${item.workflowId}-${i}`}
              className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs"
            >
              <span className="flex-1 truncate">
                {wf?.label ?? item.workflowId}
                {item.chapterNumber != null && (
                  <span className="text-muted-foreground ml-1">
                    Ch.{item.chapterNumber}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {i > 0 && (
                  <button
                    className="p-0.5 hover:bg-muted rounded"
                    onClick={() => reorderQueue(i, i - 1)}
                  >
                    <ChevronUpIcon className="size-3" />
                  </button>
                )}
                {i < queue.length - 1 && (
                  <button
                    className="p-0.5 hover:bg-muted rounded"
                    onClick={() => reorderQueue(i, i + 1)}
                  >
                    <ChevronDownIcon className="size-3" />
                  </button>
                )}
                <button
                  className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive"
                  onClick={() => removeFromQueue(i)}
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
