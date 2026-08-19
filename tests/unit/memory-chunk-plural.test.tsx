// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * D-179 (S4, P6 v3, 3/3) — the book Memory card read "1 chunks / Indexed 1h ago".
 * The D-163 pluralisation fix shipped `countWithNoun` (7 locales) but this
 * surface was missed.
 */

const h = vi.hoisted(() => ({
  stats: { chunkCount: 1, lastIndexed: "2026-07-27T11:00:00.000Z" } as
    | { chunkCount: number; lastIndexed: string | null }
    | undefined,
}));

vi.mock("@/hooks/use-memory", () => ({
  useBookMemoryStats: () => ({ data: h.stats, isLoading: false }),
  useRebuildIndex: () => ({ mutate: vi.fn(), isPending: false }),
  useClearMemory: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MemoryStatsCard } from "@/components/memory/memory-stats-card";

beforeEach(() => {
  h.stats = { chunkCount: 1, lastIndexed: "2026-07-27T11:00:00.000Z" };
});
afterEach(() => cleanup());

describe("D-179 — Memory card pluralisation", () => {
  // The count and the noun are separate elements (big number, small label), so
  // assert on the noun label itself rather than on concatenated textContent.
  it("labels a single chunk 'chunk', never 'chunks'", () => {
    render(<MemoryStatsCard bookId="b1" />);
    expect(document.body.textContent).toContain("1");
    expect(screen.getByText("chunk")).toBeTruthy();
    expect(screen.queryByText("chunks")).toBeNull();
  });

  it("still says 'chunks' for any other count", () => {
    h.stats = { chunkCount: 42, lastIndexed: null };
    render(<MemoryStatsCard bookId="b1" />);
    expect(document.body.textContent).toContain("42");
    expect(screen.getByText("chunks")).toBeTruthy();
  });
});
