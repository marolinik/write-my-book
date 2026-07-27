// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

/**
 * D-171 (S3, P1 v3 co-floor "one-way glass") — WriterMemory was a one-way
 * mirror: the discuss loop WRITES rows the writer can never see, correct or
 * revoke, and a wrong row ("retreat into arithmetic") stays in every prompt
 * forever. The panel, the API routes and the revoke path all existed already —
 * `WriterMemoryPanel` had ZERO mounts. This locks the mount and the two
 * affordances that make it a two-way mirror on a touch device.
 */

const h = vi.hoisted(() => ({
  fetchJson: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ fetchJson: h.fetchJson }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { WriterMemoryPanel } from "@/components/memory/writer-memory-panel";

const SETTINGS_SOURCE = readFileSync(join(process.cwd(), "src/app/(app)/settings/page.tsx"), "utf8");

const MEMORIES = [
  {
    id: "m1",
    category: "constraint",
    content: "Milan's plant names stay Latin.",
    source: "discuss",
    bookId: "b1",
    active: true,
    createdAt: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "m2",
    category: "preference",
    content: "Don't flag sentence fragments.",
    source: "user",
    bookId: null,
    active: true,
    createdAt: "2026-07-26T00:00:00.000Z",
  },
];

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.fetchJson.mockReset();
  h.fetchJson.mockResolvedValue(MEMORIES);
});
afterEach(() => cleanup());

describe("D-171 — writer memory is visible and revocable", () => {
  it("is mounted on the settings surface (the panel is no longer dead code)", () => {
    expect(SETTINGS_SOURCE).toMatch(/from "@\/components\/memory\/writer-memory-panel"/);
    expect(SETTINGS_SOURCE).toMatch(/<WriterMemoryPanel/);
  });

  it("lists what the AI is carrying, including rows the AI wrote itself", async () => {
    render(wrap(<WriterMemoryPanel />));

    expect(await screen.findByText("Milan's plant names stay Latin.")).toBeTruthy();
    expect(screen.getByText("Don't flag sentence fragments.")).toBeTruthy();
  });

  it("gives every row a named revoke control (not an unlabelled icon)", async () => {
    render(wrap(<WriterMemoryPanel />));
    await screen.findByText("Milan's plant names stay Latin.");

    const forget = screen.getAllByRole("button", { name: /forget|remove|delete/i });
    expect(forget.length).toBeGreaterThanOrEqual(2);
    const edit = screen.getAllByRole("button", { name: /edit/i });
    expect(edit.length).toBeGreaterThanOrEqual(2);
  });

  it("does not hide revoke behind hover only — a touch writer can reach it (D-151 family)", async () => {
    render(wrap(<WriterMemoryPanel />));
    await screen.findByText("Milan's plant names stay Latin.");

    const row = screen.getAllByRole("button", { name: /forget|remove|delete/i })[0].parentElement!;
    const classes = row.className.split(/\s+/);
    // `opacity-0` may only appear behind a breakpoint prefix (desktop hover
    // polish); a bare `opacity-0` means invisible-until-hover on touch.
    expect(classes).not.toContain("opacity-0");
    expect(classes.some((c) => c.endsWith("group-hover:opacity-100"))).toBe(true);
  });

  it("revokes through the DELETE route the panel already had wired", async () => {
    render(wrap(<WriterMemoryPanel />));
    await screen.findByText("Milan's plant names stay Latin.");

    h.fetchJson.mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: /forget|remove|delete/i })[0]);

    await waitFor(() =>
      expect(h.fetchJson).toHaveBeenCalledWith("/api/memory/m1", { method: "DELETE" })
    );
  });
});
