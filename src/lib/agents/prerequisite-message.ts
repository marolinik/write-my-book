/**
 * O4 — make a refused start readable.
 *
 * `POST /api/books/:id/agent` answers 422 with {"missing":[…]} when a workflow's
 * prerequisites are not met. Nothing rendered that: the writer pressed start,
 * nothing happened, and no reason appeared anywhere in the app. A refusal has to
 * say what is missing and what produces it, in the writer's language, with the
 * fix one click away.
 *
 * Pure: the same formatting is used by the toast, the panel and the tests.
 */

export interface MissingPrerequisite {
  /** The server's English description — the fallback when nothing better exists. */
  description: string;
  type?: string;
  value?: string;
  /** Workflow id that produces the missing artifact. */
  satisfiedBy?: string;
}

export interface PrerequisiteStrings {
  title: string;
  /** Template with {artifact}. */
  needs: string;
  /** Template with {workflow}. */
  action: string;
  /** Localized document-type labels. */
  docTypes: Record<string, string>;
  /** Localized workflow labels. */
  workflows: Record<string, string>;
}

export interface PrerequisiteNotice {
  title: string;
  lines: string[];
  text: string;
  action?: { workflowId: string; label: string };
}

export function formatMissingPrerequisites(
  missing: readonly MissingPrerequisite[],
  strings: PrerequisiteStrings
): PrerequisiteNotice {
  const seen = new Set<string>();
  const unique = missing.filter((m) => {
    const key = `${m.type ?? ""}:${m.value ?? ""}:${m.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lines = unique.map((m) => {
    const label = m.value ? strings.docTypes[m.value] : undefined;
    // No localized label for this requirement means the server's own sentence is
    // the most honest thing available — better English than a blank refusal.
    return label ? strings.needs.replace("{artifact}", label) : m.description;
  });

  const first = unique.find(
    (m) => m.satisfiedBy && strings.workflows[m.satisfiedBy]
  );
  const action = first?.satisfiedBy
    ? {
        workflowId: first.satisfiedBy,
        label: strings.action.replace(
          "{workflow}",
          strings.workflows[first.satisfiedBy]
        ),
      }
    : undefined;

  return {
    title: strings.title,
    lines,
    text: lines.length > 0 ? `${strings.title}: ${lines.join(", ")}` : strings.title,
    action,
  };
}
