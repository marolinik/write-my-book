// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * O7 / D-203 — the dashboard's hydration mismatch.
 *
 * NudgeDismiss seeded its state from localStorage INSIDE the first render, so a
 * writer who had dismissed the nudge today got a different subtree on the client
 * than the server sent. React 19 derives `useId` from tree position, so that
 * shift renamed every id below it, and the Radix dropdown further down the
 * dashboard hydrated with a different id than the server had rendered.
 *
 * The rule under test: the first client render must match the server's, and the
 * stored preference is adopted after mount.
 */

const KEY = "wmb.nudgeDismissed";

import { NudgeDismiss } from "@/components/dashboard/nudge-dismiss";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

function renderNudge() {
  return render(
    <NudgeDismiss dismissKey="book1:dev-edit" dismissLabel="Sakrij" undoLabel="Vrati">
      <p>Nudge body</p>
    </NudgeDismiss>
  );
}

describe("NudgeDismiss hydration safety", () => {
  it("renders the nudge itself when nothing is stored", () => {
    renderNudge();
    expect(screen.getByText("Nudge body")).toBeTruthy();
  });

  it("renders the same markup on the server whatever storage says", () => {
    // The hydration contract: the server has no localStorage, so a client whose
    // first render consults it produces a different tree and shifts every useId
    // below. renderToString is exactly the server's view.
    const clean = renderToString(
      <NudgeDismiss dismissKey="book1:dev-edit" dismissLabel="Sakrij" undoLabel="Vrati">
        <p>Nudge body</p>
      </NudgeDismiss>
    );

    window.localStorage.setItem(KEY, JSON.stringify({ "book1:dev-edit": today() }));
    const withDismissal = renderToString(
      <NudgeDismiss dismissKey="book1:dev-edit" dismissLabel="Sakrij" undoLabel="Vrati">
        <p>Nudge body</p>
      </NudgeDismiss>
    );

    expect(withDismissal).toBe(clean);
    expect(clean).toContain("Nudge body");
  });

  it("adopts a dismissal stored for today once mounted", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ "book1:dev-edit": today() }));
    renderNudge();
    expect(await screen.findByText("Sakrij")).toBeTruthy();
    expect(screen.queryByText("Nudge body")).toBeNull();
  });

  it("ignores a dismissal from another day", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ "book1:dev-edit": "2020-01-01" }));
    renderNudge();
    expect(screen.getByText("Nudge body")).toBeTruthy();
  });

  it("survives unreadable storage instead of blanking the dashboard", () => {
    window.localStorage.setItem(KEY, "{not json");
    renderNudge();
    expect(screen.getByText("Nudge body")).toBeTruthy();
  });
});
