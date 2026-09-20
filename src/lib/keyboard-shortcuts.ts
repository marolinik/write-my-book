import type { UIStrings } from "@/lib/i18n/ui-strings";

export type ShortcutContext = "global" | "editor" | "agent";

export interface KeyboardShortcut {
  keys: string;
  /**
   * Lo-1: this table is module-level data, so it cannot call a hook. It holds
   * a lookup into the dictionary and the dialog resolves it at render time.
   */
  description: (t: UIStrings) => string;
  context: ShortcutContext;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // Global
  { keys: "Ctrl+K", description: (t) => t.shortcuts.openCommandPalette, context: "global" },
  { keys: "Ctrl+/", description: (t) => t.shortcuts.showShortcuts, context: "global" },
  { keys: "Ctrl+B", description: (t) => t.shortcuts.toggleSidebar, context: "global" },

  // Editor — formatting
  { keys: "Ctrl+B", description: (t) => t.editorUI.bold, context: "editor" },
  { keys: "Ctrl+I", description: (t) => t.editorUI.italic, context: "editor" },
  { keys: "Ctrl+U", description: (t) => t.editorUI.underline, context: "editor" },

  // Editor — history
  { keys: "Ctrl+Z", description: (t) => t.editorUI.undo, context: "editor" },
  { keys: "Ctrl+Shift+Z", description: (t) => t.editorUI.redo, context: "editor" },

  // Editor — tools
  { keys: "F2", description: (t) => t.shortcuts.aiRewriteSelect, context: "editor" },
  { keys: "F8", description: (t) => t.shortcuts.nextFinding, context: "editor" },
  { keys: "Shift+F8", description: (t) => t.shortcuts.previousFinding, context: "editor" },
  { keys: "Escape", description: (t) => t.shortcuts.closePopup, context: "editor" },
  { keys: "Escape", description: (t) => t.shortcuts.exitImmersive, context: "editor" },

  // Agent panel
  { keys: "Enter", description: (t) => t.shortcuts.sendMessage, context: "agent" },
  { keys: "Shift+Enter", description: (t) => t.shortcuts.newLine, context: "agent" },
];

export const CONTEXT_LABELS: Record<ShortcutContext, (t: UIStrings) => string> = {
  global: (t) => t.shortcuts.contextGlobal,
  editor: (t) => t.shortcuts.contextEditor,
  agent: (t) => t.shortcuts.contextAgent,
};
