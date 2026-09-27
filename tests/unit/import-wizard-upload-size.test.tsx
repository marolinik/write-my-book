// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * UAT P6-S01 + P6-S06, the writer's side. The dropzone promises 20 MB per
 * file; a file over it used to go to the server anyway and come back as a
 * 500 "Preview failed" in English. Now it is held back with a reason in the
 * writer's language, and a selection is sent one file per request, so two
 * large manuscripts together are not refused for being large together.
 */

const sr = getUIStrings("sr");
const MB = 1024 * 1024;

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "sr", t: sr }),
  useLocale: () => "sr-Latn",
}));

// The preview list's drag-and-drop is not under test; show number + title.
vi.mock("@/components/import-export/chapter-preview-list", () => ({
  ChapterPreviewList: ({ chapters }: { chapters: Array<{ tempId: string; number: number; title: string }> }) =>
    createElement(
      "ol",
      { "data-testid": "preview" },
      chapters.map((c) => createElement("li", { key: c.tempId }, `${c.number}. ${c.title}`))
    ),
}));

import { ImportWizard } from "@/components/import-export/import-wizard";

function fileOfSize(name: string, bytes: number): File {
  const file = new File(["x"], name, { type: "text/plain" });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

/** A server that parses each uploaded file into the chapters listed for it. */
function previewServer(chaptersByFile: Record<string, string[]>) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const files = (init.body as FormData).getAll("files") as File[];
    const chapters = files.flatMap((f) =>
      (chaptersByFile[f.name] ?? []).map((title, i) => ({
        tempId: `${f.name}-${i + 1}`,
        number: i + 1,
        title,
        content: title,
        wordCount: 1,
        sourceFile: f.name,
      }))
    );
    return new Response(JSON.stringify({ chapters, existingChapters: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const utils = render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(ImportWizard, { bookId: "b1", autoAnalyze: false })
    )
  );
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { input };
}

function pick(input: HTMLInputElement, files: File[]) {
  fireEvent.change(input, { target: { files } });
}

function tooLarge(name: string): string {
  return sr.importExportUI.fileTooLarge.replace("{name}", name).replace("{size}", "20");
}

let fetchMock: ReturnType<typeof previewServer>;

beforeEach(() => {
  fetchMock = previewServer({
    "Rukopis.docx": ["Povratak", "Kuća"],
    "Drugi.docx": ["Most"],
    "Epilog.md": ["Epilog"],
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("import wizard at the size limit (P6-S01, P6-S06)", () => {
  it("holds back a file over 20 MB and says why, in the writer's language", async () => {
    const { input } = renderWizard();
    pick(input, [fileOfSize("Veliki.docx", 21 * MB)]);

    expect(await screen.findByText(tooLarge("Veliki.docx"))).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Preview failed")).toBeNull();
  });

  it("previews the files within the limit and lists the one it left out", async () => {
    const { input } = renderWizard();
    pick(input, [fileOfSize("Veliki.docx", 26 * MB), fileOfSize("Epilog.md", 3 * 1024)]);

    expect(await screen.findByText(tooLarge("Veliki.docx"))).toBeTruthy();
    expect(screen.getByTestId("preview").textContent).toContain("1. Epilog");
    const sent = fetchMock.mock.calls.flatMap(([, init]) =>
      ((init.body as FormData).getAll("files") as File[]).map((f) => f.name)
    );
    expect(sent).toEqual(["Epilog.md"]);
  });

  it("sends a selection one file per request and numbers the chapters straight through", async () => {
    const { input } = renderWizard();
    pick(input, [fileOfSize("Rukopis.docx", 15 * MB), fileOfSize("Drugi.docx", 15 * MB)]);

    await waitFor(() => expect(screen.getByTestId("preview")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init.body as FormData).getAll("files")).toHaveLength(1);
    }
    const rows = Array.from(screen.getByTestId("preview").querySelectorAll("li")).map((li) => li.textContent);
    expect(rows).toEqual(["1. Povratak", "2. Kuća", "3. Most"]);
  });
});
