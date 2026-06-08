"use client";

import { PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentUIStore } from "@/stores/agent-ui-store";

interface StartWorkflowButtonProps {
  workflowId: string;
  label?: string;
}

export function StartWorkflowButton({ workflowId, label = "Start" }: StartWorkflowButtonProps) {
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  return (
    <Button size="sm" className="shrink-0 ml-3" onClick={() => openWithWorkflow(workflowId)}>
      <PlayIcon className="mr-1 size-4" />
      {label}
    </Button>
  );
}
