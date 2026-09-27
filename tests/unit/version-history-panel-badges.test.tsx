// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P3-S16 / P3-S17 — Version History crashed the whole chapter page on any
 * chapter that had ever been through find & replace. The replace route
 * stamps its versions `find_replace` (R-310), the badge map had no entry for
 * it, and the fallback stored the raw string where a label FUNCTION belongs:
 * `badge.label(t)` threw "badge.label is not a function" inside render, and
 * the error boundary replaced the page — blocking the very restore the
 * find_replace version exists for.
 *
 * P5-S10 — the row actions (View / Compare / Restore) were revealed only by
 * `group-hover`, which Tailwind v4 gates behind `@media (hover: hover)`; a
 * touch-only tablet or phone could never show them.
 */

const h = vi.hoisted(() => ({
  versions: [] as Array<{
    id: string;
    version: number;
    changeType: string;
    changeSource: string;
    wordCount: number;
    createdAt: string;
  }>,
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocumentVersions: () => ({ data: h.versions, isLoading: false }),
  useVersionContent: () => ({ data: undefined }),
  useRestoreVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { VersionHistoryPanel } from "@/components/editor/version-history-panel";

const t = getUIStrings("en");

function row(version: number, changeType: string, changeSource = "user") {
  return {
    id: `v-${version}`,
    version,
    changeType,
    changeSource,
    wordCount: 100 + version,
    createdAt: `2026-09-2${version % 10}T10:00:00.000Z`,
  };
}

afterEach(() => cleanup());

describe("Version History renders every version it is given", () => {
  it("renders a find_replace version with its own label instead of crashing", () => {
    h.versions = [row(3, "find_replace"), row(2, "manual_edit"), row(1, "import")];
    render(<VersionHistoryPanel bookId="b1" documentId="d1" />);

    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText(t.editorUI.findReplace)).toBeTruthy();
    expect(screen.getByText(t.editorChrome.versionManual)).toBeTruthy();
    expect(screen.getByText(t.editorChrome.versionImport)).toBeTruthy();
  });

  it("survives a change type it has never heard of, without showing the raw id", () => {
    h.versions = [row(2, "some_future_job"), row(1, "manual_edit")];
    render(<VersionHistoryPanel bookId="b1" documentId="d1" />);

    expect(screen.getByText("v2")).toBeTruthy();
    expect(screen.queryByText("some_future_job")).toBeNull();
    // The older version stays restorable.
    expect(screen.getAllByTitle(t.editorUI.restoreVersion)).toHaveLength(1);
  });
});

describe("P5-S10 — row actions on a touch screen", () => {
  it("does not hide View/Compare/Restore behind hover alone", () => {
    h.versions = [row(2, "manual_edit"), row(1, "manual_edit")];
    render(<VersionHistoryPanel bookId="b1" documentId="d1" />);

    const actions = screen.getByTitle(t.editorUI.restoreVersion).parentElement!;
    const classes = actions.className.split(/\s+/);
    // A bare opacity-0 hides the actions on every device; hover can only
    // reveal them where hovering exists. Hiding must be scoped to devices
    // that can hover, and keyboard focus must reveal them too.
    expect(classes).not.toContain("opacity-0");
    expect(classes.some((c) => /hover:hover.*:opacity-0$/.test(c))).toBe(true);
    expect(classes).toContain("focus-within:opacity-100");
  });
});
