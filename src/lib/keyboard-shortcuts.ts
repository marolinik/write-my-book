export type ShortcutContext = "global" | "editor" | "agent";

export interface KeyboardShortcut {
  keys: string;
  description: string;
  context: ShortcutContext;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // Global
  { keys: "Ctrl+K", description: "Open command palette", context: "global" },
  { keys: "Ctrl+/", description: "Show keyboard shortcuts", context: "global" },
  { keys: "Ctrl+B", description: "Toggle sidebar", context: "global" },

  // Editor — formatting
  { keys: "Ctrl+B", description: "Bold", context: "editor" },
  { keys: "Ctrl+I", description: "Italic", context: "editor" },
  { keys: "Ctrl+U", description: "Underline", context: "editor" },

  // Editor — history
  { keys: "Ctrl+Z", description: "Undo", context: "editor" },
  { keys: "Ctrl+Shift+Z", description: "Redo", context: "editor" },

  // Editor — tools
  { keys: "F2", description: "AI Rewrite (select text first)", context: "editor" },
  { keys: "F8", description: "Next finding (opens review)", context: "editor" },
  { keys: "Shift+F8", description: "Previous finding", context: "editor" },
  { keys: "Escape", description: "Close popup or tooltip", context: "editor" },
  { keys: "Escape", description: "Exit immersive mode", context: "editor" },

  // Agent panel
  { keys: "Enter", description: "Send message", context: "agent" },
  { keys: "Shift+Enter", description: "New line in message", context: "agent" },
];

export const CONTEXT_LABELS: Record<ShortcutContext, string> = {
  global: "Global",
  editor: "Editor",
  agent: "Agent Panel",
};
