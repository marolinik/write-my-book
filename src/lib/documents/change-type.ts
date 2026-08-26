/**
 * `change_source` and `change_type` are two DIFFERENT vocabularies on a
 * DocumentVersion row and must not be conflated:
 *
 *   change_source — WHO initiated the write. Free-form, fine-grained, and open
 *     to new server-side jobs: `user`, `manual`, `agent`, `import`, `restore`,
 *     `system`, `migration`, `conflict-backup`, `conflict-resolve`,
 *     `transcript-recovery`.
 *   change_type   — WHAT KIND of change it was. This is the column Version
 *     History renders (`version-history-panel.tsx` badge map: `agent_write` →
 *     "AI", `manual_edit` → "Manual", `revision` → "Restore", `import` →
 *     "Import"), so it stays a small, closed, writer-legible set.
 *
 * D-199: `DocumentService.create()` had no `changeType` parameter and hardcoded
 * `manual_edit`, so every created document — agent-written, imported,
 * transcript-recovered — claimed to be the writer's own typing. This table is
 * the honest default for callers that state only the source.
 */
const CHANGE_TYPE_BY_SOURCE: Readonly<Record<string, string>> = {
  // The writer's own words, however they reached the save.
  user: "manual_edit",
  manual: "manual_edit",
  "conflict-backup": "manual_edit",
  "conflict-resolve": "manual_edit",
  // Someone else's manuscript arriving wholesale — neither typed here nor
  // written by a model.
  import: "import",
  // Putting an earlier version back is what `revision` means (the same value
  // VersionManager.restoreVersion stamps explicitly).
  restore: "revision",
};

/**
 * Derive the `change_type` badge value from a write's `change_source`.
 *
 * Unknown sources fall through to `agent_write`: everything not in the table
 * above is a server-side writer (`agent`, `system`, `migration`,
 * `transcript-recovery`, future jobs), and the one label we must never hand
 * out by default is the claim that a human typed it.
 */
export function changeTypeForSource(changeSource: string): string {
  return CHANGE_TYPE_BY_SOURCE[changeSource] ?? "agent_write";
}
