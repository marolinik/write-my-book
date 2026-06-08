"use client";

import Link from "next/link";
import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleDashedIcon,
  AlertTriangleIcon,
  PencilIcon,
  PartyPopperIcon,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/components/providers/language-provider";

interface JourneyChecklistStep {
  workflowId: string;
  label: string;
  completed: boolean;
  isCurrent: boolean;
  optional: boolean;
  warning?: string;
  href: string;
}

interface JourneyChecklistProps {
  bookId: string;
  journeyName: string;
  steps: JourneyChecklistStep[];
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  onChangeJourney: () => void;
}

export function JourneyChecklist({
  journeyName,
  steps,
  completedCount,
  totalCount,
  allComplete,
  onChangeJourney,
}: JourneyChecklistProps) {
  const { t } = useLanguage();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-1.5">
        <span className="truncate flex-1">{journeyName}</span>
        <span className="text-[10px] text-muted-foreground font-normal">
          {completedCount}/{totalCount}
        </span>
        <button
          type="button"
          onClick={onChangeJourney}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t.journey.changeJourney}
        >
          <PencilIcon className="size-3" />
        </button>
      </SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {steps.map((step) => (
            <SidebarMenuItem key={step.workflowId}>
              <SidebarMenuButton asChild className="h-7">
                <Link href={step.href}>
                  {/* Icon */}
                  {step.completed ? (
                    <CheckCircle2Icon className="size-3.5 text-green-500 shrink-0" />
                  ) : step.isCurrent ? (
                    <CircleDotIcon className="size-3.5 text-primary shrink-0 animate-pulse" />
                  ) : (
                    <CircleDashedIcon className="size-3.5 text-muted-foreground/40 shrink-0" />
                  )}

                  {/* Label */}
                  <span
                    className={
                      step.isCurrent
                        ? "text-xs font-semibold text-foreground"
                        : step.completed
                          ? "text-xs text-muted-foreground"
                          : "text-xs text-muted-foreground/60"
                    }
                  >
                    {step.label}
                    {step.optional ? " (optional)" : ""}
                  </span>

                  {/* Warning badge */}
                  {step.warning && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangleIcon className="size-3 text-amber-500 ml-auto shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="text-xs">{step.warning}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        {/* Celebration message */}
        {allComplete && (
          <div className="px-3 py-2 text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
            <PartyPopperIcon className="size-3.5" />
            <span>{t.journey.allComplete}</span>
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
