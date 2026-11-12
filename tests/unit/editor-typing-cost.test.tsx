// @vitest-environment jsdom
// P2-49: typing serialized the whole chapter three times per keystroke, the
// pacing strip split every sentence even when collapsed, and every autosave
// refetched the whole chapter only to discard it.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const h = vi.hoisted(() => ({ countMixedWords: vi.fn(() => 3) }));
vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
  useLocale: () => "en-US",
}));
vi.mock("@/lib/text/cjk", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  countMixedWords: h.countMixedWords,
}));

import { PacingHeatmap } from "@/components/editor/pacing-heatmap";
import { useSaveChapterContent } from "@/hooks/use-documents";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PacingHeatmap", () => {
  it("does no sentence work while collapsed", () => {
    render(<PacingHeatmap text={"One. Two words here. Three short ones now."} />);
    expect(h.countMixedWords).not.toHaveBeenCalled();
  });
});

describe("useSaveChapterContent", () => {
  it("writes the saved text into the cache instead of refetching the chapter", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ wordCount: 4, version: 8, bookWordCount: 900 }), { status: 200 })
        : new Response(JSON.stringify({ markdown: "stale", wordCount: 1, version: 7 }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["chapter-content", "b1", "c1"], { markdown: "old", wordCount: 1, version: 7 });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveChapterContent("b1", "c1"), { wrapper });
    await result.current.mutateAsync({ markdown: "The new text here." });
    await waitFor(() =>
      expect(qc.getQueryData(["chapter-content", "b1", "c1"])).toMatchObject({ markdown: "The new text here.", version: 8, wordCount: 4 })
    );
    expect(fetchMock.mock.calls.filter(([, init]) => !init || init.method !== "PUT")).toHaveLength(0);
  });
});

describe("ManuscriptEditor (source)", () => {
  const src = readFileSync("src/components/editor/manuscript-editor.tsx", "utf8");

  it("serializes the document once per tick for the word count and both strips", () => {
    expect(src).not.toMatch(/countWords\(getMarkdownFromEditor\(/);
    expect(src).toMatch(/const liveMarkdown = useMemo\(/);
    expect(src).toMatch(/<PacingHeatmap text=\{liveMarkdown/);
    expect(src).toMatch(/<ProseSyntaxHighlight text=\{liveMarkdown/);
  });

  it("throttles the per-edit re-render", () => {
    const onUpdate = src.slice(src.indexOf("onUpdate: () => {"), src.indexOf("onUpdate: () => {") + 700);
    expect(onUpdate).toMatch(/editTickTimerRef/);
    expect(onUpdate).toMatch(/EDIT_TICK_THROTTLE_MS/);
  });
});
