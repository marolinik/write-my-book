"use client";

import { cn } from "@/lib/utils";

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const MAX_WIDTH_CLASSES = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "",
} as const;

export function PageShell({
  children,
  title,
  description,
  actions,
  maxWidth = "lg",
  className,
}: PageShellProps) {
  return (
    <div className={cn("p-6 lg:p-8", MAX_WIDTH_CLASSES[maxWidth], maxWidth !== "full" && "mx-auto", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between mb-6">
          <div className="min-w-0 flex-1">
            {title && (
              <h1 className="font-display text-2xl font-bold">{title}</h1>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && <div className="flex gap-2 shrink-0 ml-4">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
