"use client";

import { PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentUIStore } from "@/stores/agent-ui-store";

interface StartWorkflowButtonProps {
  workflowId: string;
  label?: string;
  /** Optional message seeded into the agent session alongside the workflow (e.g.
   *  a synopsis to turn into chapter beats UDG round-5). */
  initialMessage?: string;
}

export function StartWorkflowButton({
  workflowId,
  label = "Start",
  initialMessage,
}: StartWorkflowButtonProps) {
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  return (
    <Button
      size="sm"
      className="shrink-0 ml-3"
      onClick={() => openWithWorkflow(workflowId, initialMessage)}
    >
      <PlayIcon className="mr-1 size-4" />
      {label}
    </Button>
  );
}
