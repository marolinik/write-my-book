// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * P5-S12 — an approval request never reached the phone. The only EventSource
 * for a run lived in useAgentStream, called only by AgentPanel — and the
 * panel is unmounted whenever it is collapsed to the bubble (the default
 * while writing, and what "tap Agent to collapse" does on a phone). So a run
 * that asked for approval while the panel was collapsed streamed into
 * nothing: 0 events, no ApprovalNotifier toast (it reads the store the
 * stream fills), and the gate silently expired as a rejection after ten
 * minutes. The documented fix (ApprovalNotifier, "fires regardless of which
 * panel mode is active") was dead in exactly the case it exists for.
 *
 * Second half: on reopen, the stale-session reconciler read the DB row —
 * still "completed" from turn 1, since a follow-up turn only flips the
 * in-memory status — and closed the live stream of the running turn.
 */

const h = vi.hoisted(() => ({
  params: { bookId: "b1" } as Record<string, string>,
  toastWarning: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useParams: () => h.params,
  usePathname: () => "/books/b1/chapters/c4",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    warning: h.toastWarning,
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// The shell's chrome is irrelevant here; the agent panel is deliberately a
// marker so the test proves the stream does not depend on it being mounted.
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarInset: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/layout/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
vi.mock("@/components/layout/mobile-bottom-nav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/layout/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/components/layout/keyboard-shortcuts-dialog", () => ({
  KeyboardShortcutsDialog: () => null,
}));
vi.mock("@/components/agent/agent-panel-wrapper", () => ({
  AgentPanelWrapper: () => <div data-testid="agent-panel" />,
}));
vi.mock("@/components/agent/ai-companion-bubble", () => ({ AICompanionBubble: () => null }));
vi.mock("@/components/agent/ai-mini-panel", () => ({ AIMiniPanel: () => null }));
vi.mock("@/components/agent/floating-agent-overlay", () => ({
  FloatingAgentOverlay: () => null,
}));
vi.mock("@/components/providers/language-provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/providers/language-provider")>();
  return {
    ...actual,
    LanguageProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/use-page-context", () => ({ usePageContext: () => {} }));
vi.mock("@/stores/agent-store", () => ({ hydrateAgentStore: () => {} }));

import { AppShell } from "@/app/(app)/app-shell";
import { ApprovalNotifier } from "@/components/agent/approval-notifier";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useAgentSessionStore, type SessionState } from "@/stores/agent-session-store";
import { useAgentUIStore } from "@/stores/agent-ui-store";

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  emit(message: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
}

function runningSession(): SessionState {
  return {
    sessionId: "s1",
    workflowId: "revise",
    agentType: "ghostwriter",
    bookId: "b1",
    chapterNumber: 4,
    status: "running",
    messages: [],
    error: null,
    suggestedNext: [],
    startedAt: Date.now() - 60_000,
    extensionsUsed: 0,
    currentCost: 0,
    isBackground: false,
  } as SessionState;
}

function withQuery(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function streamFor(sessionId: string) {
  return FakeEventSource.instances.find(
    (es) => es.url === `/api/books/b1/agent/${sessionId}/stream` && es.readyState !== 2
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  h.toastWarning.mockClear();
  h.params = { bookId: "b1" };
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
  useAgentSessionStore.setState({ sessions: { s1: runningSession() }, activeSessionId: "s1" });
  useAgentUIStore.setState({ panelMode: "bubble" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("P5-S12 — the run's stream does not depend on the panel being open", () => {
  it("streams a running session while the panel is collapsed, and the approval reaches the writer", async () => {
    // Nothing answers the reconciler — this case is about the stream alone.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(withQuery(<AppShell initialLanguage="en">{null}</AppShell>));

    // Collapsed: the panel is not mounted …
    expect(document.querySelector('[data-testid="agent-panel"]')).toBeNull();
    // … and the run is still being listened to.
    const es = streamFor("s1");
    expect(es).toBeDefined();

    act(() => {
      es!.open();
      es!.emit({
        type: "approval_request",
        content: "Replace chapter 4 with the revised draft?",
        metadata: { approvalId: "a1", approvalTitle: "Overwrite Chapter 4" },
      });
    });

    const messages = useAgentSessionStore.getState().sessions.s1.messages;
    expect(messages.some((m) => m.type === "approval_request")).toBe(true);
    expect(h.toastWarning).toHaveBeenCalledWith(
      "Overwrite Chapter 4",
      expect.objectContaining({ description: "Replace chapter 4 with the revised draft?" })
    );
  });
});

describe("P5-S12 — the mini panel is collapsed too", () => {
  it("announces an approval while the desktop panel is minimised (the mini card shows no approvals)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    useAgentUIStore.setState({ panelMode: "mini" });
    useAgentSessionStore.setState({
      sessions: {
        s1: {
          ...runningSession(),
          messages: [
            {
              type: "approval_request",
              content: "Replace chapter 4 with the revised draft?",
              metadata: { approvalId: "a-mini", approvalTitle: "Overwrite Chapter 4" },
            },
          ],
        } as SessionState,
      },
      activeSessionId: "s1",
    });

    render(<ApprovalNotifier />);

    expect(h.toastWarning).toHaveBeenCalledWith(
      "Overwrite Chapter 4",
      expect.objectContaining({ description: "Replace chapter 4 with the revised draft?" })
    );
  });
});

describe("P5-S12 — the reconciler does not end a run whose stream is live", () => {
  it("keeps a follow-up turn running although the DB row still says completed", async () => {
    let answer: (body: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = (body) =>
              resolve(
                new Response(JSON.stringify(body), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                })
              );
          })
      )
    );

    const { unmount } = renderHook(() => useAgentStream("b1"), {
      wrapper: ({ children }) => withQuery(children),
    });

    const es = streamFor("s1");
    expect(es).toBeDefined();
    act(() => es!.open());

    // Turn 1's end is still what the DB says while turn 2 runs.
    await act(async () => {
      answer({ status: "completed", completedAt: new Date().toISOString() });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(useAgentSessionStore.getState().sessions.s1.status).toBe("running");
    expect(es!.readyState).toBe(FakeEventSource.OPEN);
    unmount();
  });
});
