// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import type { ImportPreviewResponse } from "@/lib/validation";

/**
 * P6-S04 — re-importing a partial DOCX into a 29-chapter book overwrote the
 * writer's edited chapters 1 and 2. The wizard sent every row as `create`,
 * the parser numbers rows from 1, and the preview only showed a count notice
 * promising that replacement "will be available". A row whose number lands on
 * an existing chapter now says so and must be answered Replace or Skip before
 * anything is imported, and the writer can say which number the import starts
 * at, so revised chapters 5 and 6 can be aimed at chapters 5 and 6.
 *
 * P6-S02 — the row holding text from before the first chapter heading says so,
 * because the writer may only want it if it is a prologue, not a title page.
 */

const EN = getUIStrings("en");
const T = EN.importExportUI;

const h = vi.hoisted(() => ({
  preview: null as unknown,
  confirm: vi.fn(),
}));

vi.mock("@/hooks/use-import", () => ({
  useImportPreview: () => ({
    mutate: (_files: File[], opts: { onSuccess: (d: unknown) => void }) =>
      opts.onSuccess(h.preview),
    isPending: false,
    isError: false,
    reset: () => {},
  }),
  useImportConfirm: () => ({
    mutate: h.confirm,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
}));

vi.mock("@/stores/agent-ui-store", () => ({
  useAgentUIStore: (select: (s: { openWithWorkflow: () => void }) => unknown) =>
    select({ openWithWorkflow: () => {} }),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ t: getUIStrings("en"), language: "en" }),
  useLocale: () => "en-US",
}));

vi.mock("@/components/import-export/file-dropzone", () => ({
  FileDropzone: ({ onFilesSelected }: { onFilesSelected: (f: File[]) => void }) => (
    <button
      type="button"
      onClick={() => onFilesSelected([new File(["x"], "Ispravke.docx")])}
    >
      pick-files
    </button>
  ),
}));

import { ImportWizard } from "@/components/import-export/import-wizard";

const previewRow = (number: number, title: string, extra: object = {}) => ({
  tempId: `Ispravke.docx-${number}`,
  number,
  title,
  content: `text of ${title}`,
  wordCount: 550,
  sourceFile: "Ispravke.docx",
  ...extra,
});

/** A 29-chapter book the writer has written and edited. */
const WRITTEN = Array.from({ length: 29 }, (_, i) => ({
  number: i + 1,
  title: `Existing ${i + 1}`,
  wordCount: 3000,
}));

function openPreview(preview: ImportPreviewResponse) {
  h.preview = preview;
  render(<ImportWizard bookId="b1" autoAnalyze={false} />);
  fireEvent.click(screen.getByText("pick-files"));
}

const importButton = () => screen.getByRole("button", { name: /^Import \d/ });
const sent = () =>
  h.confirm.mock.calls[0][0] as Array<{ number: number; title: string; action: string }>;

beforeEach(() => {
  h.confirm.mockReset();
});
afterEach(cleanup);

describe("a row that lands on an existing chapter must be answered", () => {
  it("shows which chapter it would overwrite and blocks the import until answered", () => {
    openPreview({
      chapters: [previewRow(1, "Svadba"), previewRow(2, "Pismo")],
      existingChapters: WRITTEN,
    });

    expect(screen.getByText(/Chapter 1 already exists: “Existing 1”/)).toBeTruthy();
    expect(screen.getByText(/Chapter 2 already exists: “Existing 2”/)).toBeTruthy();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(importButton());
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("sends the writer's answer per chapter: replace goes out, skip stays home", () => {
    openPreview({
      chapters: [previewRow(1, "Svadba"), previewRow(2, "Pismo")],
      existingChapters: WRITTEN,
    });

    fireEvent.click(screen.getAllByRole("button", { name: T.actionSkip })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: T.actionReplace })[1]);

    expect((importButton() as HTMLButtonElement).disabled).toBe(false);
    expect(importButton().textContent).toMatch(/Import 1 chapter\b/);
    fireEvent.click(importButton());

    expect(sent()).toEqual([
      { number: 2, title: "Pismo", content: "text of Pismo", action: "replace" },
    ]);
  });

  it("'Replace all' answers every conflict at once", () => {
    openPreview({
      chapters: [previewRow(1, "Svadba"), previewRow(2, "Pismo")],
      existingChapters: WRITTEN,
    });

    fireEvent.click(screen.getByRole("button", { name: T.replaceAll }));
    fireEvent.click(importButton());

    expect(sent().map((c) => c.action)).toEqual(["replace", "replace"]);
  });

  it("the writer can aim the import at chapters 5 and 6", () => {
    openPreview({
      chapters: [previewRow(1, "Svadba"), previewRow(2, "Pismo")],
      existingChapters: WRITTEN,
    });

    fireEvent.change(screen.getByLabelText(T.numberFrom), { target: { value: "5" } });

    expect(screen.getByText(/Chapter 5 already exists: “Existing 5”/)).toBeTruthy();
    expect(screen.getByText(/Chapter 6 already exists: “Existing 6”/)).toBeTruthy();
    expect(screen.queryByText(/Chapter 1 already exists/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: T.replaceAll }));
    fireEvent.click(importButton());
    expect(sent().map((c) => [c.number, c.action])).toEqual([
      [5, "replace"],
      [6, "replace"],
    ]);
  });

  it("an answer does not follow a row to a different chapter number", () => {
    openPreview({
      chapters: [previewRow(1, "Svadba"), previewRow(2, "Pismo")],
      existingChapters: WRITTEN,
    });

    fireEvent.click(screen.getByRole("button", { name: T.replaceAll }));
    fireEvent.change(screen.getByLabelText(T.numberFrom), { target: { value: "5" } });

    expect((importButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("chapters past the end of the book are simply added", () => {
    openPreview({
      chapters: [previewRow(1, "Svadba"), previewRow(2, "Pismo")],
      existingChapters: WRITTEN,
    });

    fireEvent.change(screen.getByLabelText(T.numberFrom), { target: { value: "30" } });
    expect(screen.queryByText(/already exists/)).toBeNull();
    fireEvent.click(importButton());
    expect(sent().map((c) => [c.number, c.action])).toEqual([
      [30, "create"],
      [31, "create"],
    ]);
  });
});

describe("a new book's blank Chapter 1 is not a conflict", () => {
  it("imports straight into it", () => {
    openPreview({
      chapters: [previewRow(1, "Prolog"), previewRow(2, "Kiša")],
      existingChapters: [{ number: 1, title: null, wordCount: 0 }],
    });

    expect(screen.queryByText(/already exists/)).toBeNull();
    fireEvent.click(importButton());
    expect(sent().map((c) => c.action)).toEqual(["create", "create"]);
  });
});

describe("P6-S02 — text from before the first heading is labelled", () => {
  it("the kept row says where its text came from", () => {
    openPreview({
      chapters: [
        previewRow(1, "Šapat ćutanja — roman", { beforeFirstHeading: true }),
        previewRow(2, "Prolog"),
      ],
      existingChapters: [],
    });

    expect(screen.getAllByText(T.beforeFirstHeading)).toHaveLength(1);
  });
});
