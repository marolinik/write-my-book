// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

/**
 * P1-S06 — at 45,000 words a Free writer's Memory card read "8 chunks ·
 * Indexed 1m ago", as if memory were current, while indexing had silently
 * stopped at the 40,000-word cap. When the stats say indexing is paused, the
 * card must say so, in the writer's language, with a way to lift it.
 */

const h = vi.hoisted(() => ({
  stats: null as null | Record<string, unknown>,
}));

vi.mock("@/hooks/use-memory", () => ({
  useBookMemoryStats: () => ({ data: h.stats, isLoading: false }),
  useRebuildIndex: () => ({ mutate: vi.fn(), isPending: false }),
  useClearMemory: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MemoryStatsCard } from "@/components/memory/memory-stats-card";

const EN = getUIStrings("en");

function pausedCopyEn(): string {
  return EN.memoryUI.indexingPaused.replace("{words}", (40_000).toLocaleString("en-US"));
}

beforeEach(() => {
  h.stats = {
    bookId: "b1",
    chunkCount: 8,
    lastIndexed: new Date().toISOString(),
    embeddingCost: 0,
    embeddingTokens: 0,
    indexingPaused: false,
  };
});

afterEach(() => cleanup());

describe("MemoryStatsCard — a paused index is said, not hidden", () => {
  it("shows the paused notice and a way to the plans when indexing is paused", () => {
    h.stats = { ...h.stats, indexingPaused: true };
    render(<MemoryStatsCard bookId="b1" />);
    expect(screen.getByText(pausedCopyEn())).toBeTruthy();
    const link = screen.getByRole("link", { name: EN.appUI.viewPlans });
    expect(link.getAttribute("href")).toBe("/settings/billing");
  });

  it("shows no notice while indexing runs", () => {
    render(<MemoryStatsCard bookId="b1" />);
    expect(screen.queryByText(pausedCopyEn())).toBeNull();
    expect(screen.queryByRole("link", { name: EN.appUI.viewPlans })).toBeNull();
  });

  it("still shows the notice when nothing was ever indexed (paused before the first chunk)", () => {
    h.stats = { ...h.stats, chunkCount: 0, lastIndexed: null, indexingPaused: true };
    render(<MemoryStatsCard bookId="b1" />);
    expect(screen.getByText(pausedCopyEn())).toBeTruthy();
  });
});

describe("memoryUI.indexingPaused — every language carries it", () => {
  it("is translated in every UI locale and names the word cap", () => {
    for (const lang of UI_SUPPORTED_LANGUAGES) {
      const copy = getUIStrings(lang.code).memoryUI.indexingPaused;
      expect(copy, lang.code).toBeTruthy();
      expect(copy, `${lang.code} keeps the {words} slot`).toContain("{words}");
      if (lang.code !== "en") {
        expect(copy, `${lang.code} is still English`).not.toBe(EN.memoryUI.indexingPaused);
      }
    }
  });
});
