// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import type { Editor as ReactEditor } from "@tiptap/react";
import { createEditorExtensions, getMarkdownFromEditor } from "@/components/editor/editor-utils";
import { EN } from "@/lib/i18n/ui-strings/en";

/**
 * The Polish Scene panel on a real editor: it sends the scene the writer
 * selected, and puts the chosen version back over exactly those paragraphs,
 * only while they still hold the text that was sent.
 */

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-polish-scene", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-polish-scene")>();
  return { ...actual, usePolishScene: () => ({ mutateAsync }) };
});

import { PolishSceneError } from "@/hooks/use-polish-scene";
import { PolishScenePanel } from "@/components/editor/polish-scene-panel";

const DOC = "Before.\n\nMara stood at the window.\n\nShe counted the harbour lights.\n\nAfter.";
const SCENE = "Mara stood at the window.\n\nShe counted the harbour lights.";
const LIGHT = "Mara stood still at the window.\n\nShe counted the harbour lights, one by one.";
const BOLD = "At the window, Mara counted the harbour lights as they died.";

let editor: Editor | null = null;

/** A real editor with the whole scene selected, from "Mara" to "lights.". */
function makeEditor(markdown = DOC, from = "Mara", to = "lights."): Editor {
  editor = new Editor({ extensions: createEditorExtensions({}), content: markdown });
  const text = (needle: string) => {
    let found = -1;
    editor!.state.doc.descendants((node, pos) => {
      if (found >= 0 || !node.isText) return found < 0;
      const idx = node.text!.indexOf(needle);
      if (idx >= 0) found = pos + idx;
      return false;
    });
    return found;
  };
  editor.commands.setTextSelection({ from: text(from), to: text(to) + to.length });
  return editor;
}

function renderPanel(ed: Editor, onClose = vi.fn()) {
  render(<PolishScenePanel editor={ed as unknown as ReactEditor} bookId="b1" onClose={onClose} />);
  return onClose;
}

function bothVersions() {
  mutateAsync.mockResolvedValue({
    versions: [
      { intensity: "light", text: LIGHT },
      { intensity: "bold", text: BOLD },
    ],
    failed: [],
  });
}

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  editor?.destroy();
  editor = null;
});

describe("PolishScenePanel", () => {
  it("refuses a selection too long for one polish without calling the server", () => {
    renderPanel(makeEditor("a".repeat(20_001), "aaa", "aaa"));
    expect(screen.getByText(EN.polishScene.tooLong)).toBeTruthy();
    expect((screen.getByRole("button", { name: EN.polishScene.start }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses a Chinese scene whose rewrite cannot fit one reply, though it is under the character cap", () => {
    renderPanel(makeEditor("港".repeat(12_000), "港港", "港港"));
    expect(screen.getByText(EN.polishScene.tooLong)).toBeTruthy();
  });

  it("sends the scene and the writer's focus, then replaces exactly those paragraphs", async () => {
    const ed = makeEditor();
    bothVersions();
    renderPanel(ed);

    fireEvent.change(screen.getByLabelText(EN.polishScene.focusLabel), {
      target: { value: "clearer dialogue" },
    });
    fireEvent.click(screen.getByRole("button", { name: EN.polishScene.start }));

    await screen.findByRole("tab", { name: EN.polishScene.light });
    const vars = mutateAsync.mock.calls[0][0];
    expect(vars.selectedText).toBe(SCENE);
    expect(vars.contextBefore).toContain("Before.");
    expect(vars.focus).toBe("clearer dialogue");
    expect(vars.signal).toBeInstanceOf(AbortSignal);

    fireEvent.click(screen.getByRole("button", { name: EN.editorChrome.acceptRewrite }));
    expect(getMarkdownFromEditor(ed)).toBe(`Before.\n\n${LIGHT}\n\nAfter.`);
  });

  it("does not overwrite a scene the writer changed while the rewrite was running", async () => {
    const ed = makeEditor();
    bothVersions();
    renderPanel(ed);
    fireEvent.click(screen.getByRole("button", { name: EN.polishScene.start }));
    await screen.findByRole("tab", { name: EN.polishScene.light });

    // The writer types inside the scene while the rewrite runs.
    let pos = -1;
    ed.state.doc.descendants((node, p) => {
      if (pos < 0 && node.isText && node.text!.includes("window.")) pos = p + node.text!.indexOf("window.");
      return pos < 0;
    });
    ed.commands.insertContentAt(pos, "open ");
    const edited = getMarkdownFromEditor(ed);

    fireEvent.click(screen.getByRole("button", { name: EN.editorChrome.acceptRewrite }));
    expect(getMarkdownFromEditor(ed)).toBe(edited);
    expect(screen.getByText(EN.polishScene.textChanged)).toBeTruthy();
  });

  it("says so when only one of the two versions came back", async () => {
    mutateAsync.mockResolvedValue({
      versions: [{ intensity: "light", text: LIGHT }],
      failed: [{ intensity: "bold", reason: "truncated" }],
    });
    renderPanel(makeEditor());
    fireEvent.click(screen.getByRole("button", { name: EN.polishScene.start }));
    expect(await screen.findByText(EN.polishScene.onlyOneVersion)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: EN.polishScene.bold })).toBeNull();
  });

  it("shows the daily limit in the writer's language, not the server's English", async () => {
    mutateAsync.mockRejectedValue(new PolishSceneError(429, "Free plan includes 20 inline edits per day."));
    renderPanel(makeEditor());
    fireEvent.click(screen.getByRole("button", { name: EN.polishScene.start }));
    expect(await screen.findByText(EN.polishScene.limitReached)).toBeTruthy();
  });

  it("points at the model when the ghostwriter's model only reasoned", async () => {
    mutateAsync.mockRejectedValue(new PolishSceneError(422, "returned only reasoning", "MODEL_NO_POLISH"));
    renderPanel(makeEditor());
    fireEvent.click(screen.getByRole("button", { name: EN.polishScene.start }));
    expect(await screen.findByText(EN.polishScene.modelCannotPolish)).toBeTruthy();
  });

  it("cancels the request when the writer cancels while it runs", async () => {
    let signal: AbortSignal | undefined;
    mutateAsync.mockImplementation((vars: { signal: AbortSignal }) => {
      signal = vars.signal;
      return new Promise(() => {});
    });
    const onClose = renderPanel(makeEditor());
    fireEvent.click(screen.getByRole("button", { name: EN.polishScene.start }));
    await waitFor(() => expect(screen.getByText(EN.polishScene.working)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: EN.common.cancel }));
    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
