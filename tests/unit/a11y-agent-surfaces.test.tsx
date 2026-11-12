// @vitest-environment jsdom
// P2-52 / P2-53 / P2-54: icon-only buttons have names, the phone agent sheet
// is a real dialog, the floating overlay is a labelled region closed with
// Escape, the bottom nav marks the current page, and wide tables scroll
// inside their box instead of panning a phone.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { getUIStrings } from "@/lib/i18n/ui-strings";

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "sr", t: getUIStrings("sr") }),
  useLocale: () => "sr-RS",
}));

import { ConversationInput } from "@/components/agent/conversation-input";
import { MobileAgentSheet } from "@/components/agent/mobile-agent-sheet";
import { FloatingAgentOverlay } from "@/components/agent/floating-agent-overlay";

const sr = getUIStrings("sr");

afterEach(cleanup);

describe("agent surfaces", () => {
  it("the send button has a name in the writer's language", () => {
    render(<ConversationInput onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: sr.common.send })).toBeTruthy();
  });

  it("the phone agent sheet is a dialog named after the agent, closed with Escape", () => {
    const onClose = vi.fn();
    render(
      <MobileAgentSheet open onClose={onClose}>
        <p>panel</p>
      </MobileAgentSheet>
    );
    const dialog = screen.getByRole("dialog", { name: sr.nav.agent });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("the floating overlay is a labelled region that Escape closes", () => {
    const onClose = vi.fn();
    render(
      <FloatingAgentOverlay onClose={onClose}>
        <button type="button">inside</button>
      </FloatingAgentOverlay>
    );
    const region = screen.getByRole("complementary", { name: sr.nav.agent });
    fireEvent.keyDown(screen.getByText("inside"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(region).toBeTruthy();
  });
});

describe("named icon buttons and current-page marks (source)", () => {
  it.each([
    ["src/components/agent/agent-panel.tsx", "aria-label={t.common.close}"],
    ["src/components/agent/character-chat.tsx", "aria-label={t.common.send}"],
    ["src/components/agent/proactive-guide.tsx", "aria-label={t.common.send}"],
    ["src/components/agent/workflow-selector.tsx", "aria-label={t.common.back}"],
    ["src/components/agent/workflow-selector.tsx", "aria-label={t.common.addToQueue}"],
    ["src/components/book/marketing-kit.tsx", "aria-label={t.common.copy}"],
    ["src/components/book/story-radar.tsx", "aria-label={t.common.refresh}"],
    ["src/components/book/wiki-entity-detail.tsx", "aria-label={t.common.remove}"],
    ["src/components/book/year-in-writing-wrapped.tsx", "aria-label={t.common.goToCard"],
    ["src/components/book/year-in-writing-wrapped.tsx", "aria-label={t.common.next}"],
    ["src/components/memory/writer-memory-panel.tsx", "aria-label={t.common.cancel}"],
    ["src/components/style/character-lens-editor.tsx", "aria-label={t.common.delete}"],
    ["src/components/layout/mobile-bottom-nav.tsx", 'aria-current={isActive ? "page" : undefined}'],
  ])("%s has %s", (file, needle) => {
    expect(readFileSync(file, "utf8")).toContain(needle);
  });

  it.each([
    "src/components/book/book-view-switcher.tsx",
    "src/app/(app)/books/[bookId]/snapshot/page.tsx",
    "src/components/series/series-inheritance-panel.tsx",
    "src/components/series/series-synthesis-panel.tsx",
  ])("%s wraps its table in a horizontal scroll box", (file) => {
    const src = readFileSync(file, "utf8");
    const table = src.indexOf("<table");
    expect(src.lastIndexOf("overflow-x-auto", table)).toBeGreaterThan(-1);
    expect(table - src.lastIndexOf("overflow-x-auto", table)).toBeLessThan(400);
  });
});
