"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  KEYBOARD_SHORTCUTS,
  CONTEXT_LABELS,
  type ShortcutContext,
} from "@/lib/keyboard-shortcuts";

// Group shortcuts by context
function groupByContext() {
  const groups: Record<ShortcutContext, typeof KEYBOARD_SHORTCUTS> = {
    global: [],
    editor: [],
    agent: [],
  };
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    groups[shortcut.context].push(shortcut);
  }
  return groups;
}

const grouped = groupByContext();

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  // Ctrl+/ or Cmd+/ handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Expose open method for command palette integration
  // Use a global ref so command palette can trigger open
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__openKeyboardShortcuts = () => setOpen(true);
    return () => {
      delete (window as unknown as Record<string, unknown>).__openKeyboardShortcuts;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Available keyboard shortcuts organized by context.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {(Object.entries(grouped) as [ShortcutContext, typeof KEYBOARD_SHORTCUTS][]).map(
            ([ctx, shortcuts]) =>
              shortcuts.length > 0 && (
                <div key={ctx}>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {CONTEXT_LABELS[ctx]}
                  </h3>
                  <div className="space-y-1">
                    {shortcuts.map((s, i) => (
                      <div
                        key={`${ctx}-${i}`}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-muted-foreground">
                          {s.description}
                        </span>
                        <kbd className="ml-4 shrink-0 px-1.5 py-0.5 rounded border bg-muted text-xs font-mono text-muted-foreground">
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
