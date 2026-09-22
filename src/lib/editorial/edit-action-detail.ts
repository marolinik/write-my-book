/**
 * What happened in the edit history, stored as structure and read as language.
 *
 * `edit_actions.description` was an English sentence assembled at write time
 * and stored. No work on the component could have translated it — the English
 * was in the database. The owner's History tab showed translated action badges
 * beside "Dismissed finding: pov" and "dev-edit completed: 9 findings created
 * via tool calls".
 *
 * A row now records what happened: the action, the finding's category, the
 * prose that was replaced, the counts. The sentence is built when somebody
 * reads it, in whatever language they read in. `description` stays as the
 * English machine line for logs and nothing writer-facing renders it.
 *
 * The category is deliberately NOT translated here. `findingCategoryLabel`
 * already knows every category in every language, and a second table would be
 * a second answer to the same question.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { UIStrings } from "@/lib/i18n/ui-strings";
import { findingCategoryLabel } from "@/lib/i18n/finding-labels";
import { getAgentStrings, workflowLabel } from "@/lib/i18n/agent-strings";
import { countWithNoun } from "@/lib/i18n/plural";

/** How much of the replaced prose a history line quotes. */
const QUOTE_LIMIT = 80;

export interface ApplyDetail {
  kind: "apply";
  category: string;
  /** The prose that was replaced, already trimmed. Null when there was none. */
  text: string | null;
}

export interface DismissDetail {
  kind: "dismiss";
  category: string;
  /** The writer's own words, when they gave a reason. */
  reason: string | null;
}

export interface UndoDetail {
  kind: "undo";
  category: string;
  /** Whether the prose actually went back, which is the part that matters. */
  textReverted: boolean;
}

export interface SessionCompleteDetail {
  kind: "session_complete";
  workflowId: string;
  findingCount: number;
  rejectedCount: number;
}

export type EditActionDetail =
  | ApplyDetail
  | DismissDetail
  | UndoDetail
  | SessionCompleteDetail;

export function applyDetail(category: string, text: string | null): ApplyDetail {
  const trimmed = text?.trim() ?? "";
  return {
    kind: "apply",
    category,
    text: trimmed
      ? trimmed.length > QUOTE_LIMIT
        ? `${trimmed.slice(0, QUOTE_LIMIT)}…`
        : trimmed
      : null,
  };
}

export function dismissDetail(category: string, reason: string | null): DismissDetail {
  const trimmed = reason?.trim() ?? "";
  return { kind: "dismiss", category, reason: trimmed || null };
}

export function undoDetail(category: string, textReverted: boolean): UndoDetail {
  return { kind: "undo", category, textReverted };
}

export function sessionCompleteDetail(
  workflowId: string,
  findingCount: number,
  rejectedCount: number
): SessionCompleteDetail {
  return { kind: "session_complete", workflowId, findingCount, rejectedCount };
}

/**
 * The same value, typed the way the Json column wants it.
 *
 * Prisma's `InputJsonValue` is a recursive structural type that a named
 * interface does not satisfy, so the cast has to happen somewhere. It happens
 * here, once, rather than at each of the four write sites.
 */
export function detailForStorage(detail: EditActionDetail): Prisma.InputJsonValue {
  return detail as unknown as Prisma.InputJsonValue;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template
  );
}

/**
 * The writer-facing sentence for one history row.
 *
 * A row whose `details` are missing or unrecognised — one written by an older
 * version — says so plainly rather than falling back to the stored English.
 */
export function describeEditAction(
  action: { actionType: string; details: unknown },
  t: UIStrings,
  language: string
): string {
  const detail = action.details as EditActionDetail | null;
  if (!detail || typeof detail !== "object" || !("kind" in detail)) {
    return t.editorialUI.actionUnknown;
  }

  switch (detail.kind) {
    case "apply": {
      const category = findingCategoryLabel(detail.category, language);
      return detail.text
        ? fill(t.editorialUI.actionApplied, { category, text: detail.text })
        : fill(t.editorialUI.actionAppliedNoText, { category });
    }
    case "dismiss": {
      const category = findingCategoryLabel(detail.category, language);
      return detail.reason
        ? fill(t.editorialUI.actionDismissedBecause, { category, reason: detail.reason })
        : fill(t.editorialUI.actionDismissed, { category });
    }
    case "undo": {
      const category = findingCategoryLabel(detail.category, language);
      return fill(
        detail.textReverted
          ? t.editorialUI.actionUndoneReverted
          : t.editorialUI.actionUndoneKept,
        { category }
      );
    }
    case "session_complete": {
      const workflow =
        workflowLabel(getAgentStrings(language), detail.workflowId) ?? detail.workflowId;
      const countNoun = countWithNoun(
        detail.findingCount,
        t.editorialUI.findingOne,
        t.editorialUI.findingMany,
        { few: t.editorialUI.findingFew, language }
      );
      return detail.rejectedCount > 0
        ? fill(t.editorialUI.actionSessionDoneRejected, {
            workflow,
            countNoun,
            rejected: detail.rejectedCount,
          })
        : fill(t.editorialUI.actionSessionDone, { workflow, countNoun });
    }
    default:
      return t.editorialUI.actionUnknown;
  }
}
