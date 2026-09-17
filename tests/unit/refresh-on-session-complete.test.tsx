// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

/**
 * O8 — the journey board did not refresh when a background job finished, so the
 * card still read "not started" and the writer started the same run again.
 */

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  sessions: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock("@/stores/agent-session-store", () => ({
  useAgentSessionStore: (sel: (s: unknown) => unknown) => sel({ sessions: h.sessions }),
}));

import {
  RefreshOnSessionComplete,
  terminalSessionSignature,
} from "@/components/book/refresh-on-session-complete";

const running = { sessionId: "s1", bookId: "b1", status: "running" };
const done = { sessionId: "s1", bookId: "b1", status: "completed" };
const otherBook = { sessionId: "s9", bookId: "b2", status: "completed" };

beforeEach(() => {
  vi.clearAllMocks();
  h.sessions = {};
});
afterEach(cleanup);

describe("terminalSessionSignature", () => {
  it("ignores running sessions and sessions from other books", () => {
    expect(terminalSessionSignature({ a: running, b: otherBook }, "b1")).toBe("");
  });

  it("changes when a session reaches a terminal state", () => {
    const before = terminalSessionSignature({ a: running }, "b1");
    const after = terminalSessionSignature({ a: done }, "b1");
    expect(before).not.toBe(after);
    expect(after).toContain("s1:completed");
  });

  it("is order independent", () => {
    const one = { a: done, b: { sessionId: "s2", bookId: "b1", status: "failed" } };
    const two = { b: { sessionId: "s2", bookId: "b1", status: "failed" }, a: done };
    expect(terminalSessionSignature(one, "b1")).toBe(terminalSessionSignature(two, "b1"));
  });
});

describe("RefreshOnSessionComplete", () => {
  it("does not refresh on the first render", () => {
    h.sessions = { a: done };
    render(<RefreshOnSessionComplete bookId="b1" />);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("refreshes once when a run for this book finishes", () => {
    h.sessions = { a: running };
    const view = render(<RefreshOnSessionComplete bookId="b1" />);
    expect(h.refresh).not.toHaveBeenCalled();

    h.sessions = { a: done };
    view.rerender(<RefreshOnSessionComplete bookId="b1" />);
    expect(h.refresh).toHaveBeenCalledTimes(1);

    // A further unrelated store update must not refresh again.
    view.rerender(<RefreshOnSessionComplete bookId="b1" />);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for another book's run", () => {
    h.sessions = {};
    const view = render(<RefreshOnSessionComplete bookId="b1" />);
    h.sessions = { z: otherBook };
    view.rerender(<RefreshOnSessionComplete bookId="b1" />);
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
