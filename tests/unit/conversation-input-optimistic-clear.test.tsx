// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ConversationInput } from "@/components/agent/conversation-input";

/**
 * D-178 (S4) — the writer's message was on screen twice for the whole turn.
 *
 * `handleSend` cleared the textarea only AFTER `await onSend(...)` resolved,
 * while the discuss hook optimistically appends the same text as a writer bubble
 * immediately. Pre-streaming this hid behind a spinner; with a 19-36 s honest
 * wait it is legible for the entire turn — the sent bubble and the still-filled
 * (disabled, muted) composer showing the same sentence, so a writer cannot tell
 * whether the message was actually sent.
 *
 * Fix: clear optimistically on submit, restore on rejection — the error path
 * still keeps the text for a retry, which is why the old code held it.
 */

afterEach(() => cleanup());

function typeInto(value: string): HTMLTextAreaElement {
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value } });
  return textarea;
}

describe("ConversationInput — optimistic clear", () => {
  it("clears the composer as soon as the message is handed off, not when the turn settles", async () => {
    let release: (() => void) | undefined;
    const onSend = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));

    render(<ConversationInput onSend={onSend} />);
    const textarea = typeInto("I'm not attached to that line");
    fireEvent.click(screen.getByRole("button"));

    // Turn still in flight (release not called) — composer must already be empty.
    await waitFor(() => expect(textarea.value).toBe(""));
    expect(onSend).toHaveBeenCalledWith("I'm not attached to that line");

    release?.();
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  it("restores the text when the turn fails or is cancelled, so a retry keeps it", async () => {
    const onSend = vi.fn(() => Promise.reject(new Error("discuss_turn_cancelled")));

    render(<ConversationInput onSend={onSend} />);
    const textarea = typeInto("the names matter");
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(textarea.value).toBe("the names matter"));
  });

  it("sends on Enter and clears the same way", async () => {
    const onSend = vi.fn(() => Promise.resolve());

    render(<ConversationInput onSend={onSend} />);
    const textarea = typeInto("Enter path");
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(textarea.value).toBe(""));
    expect(onSend).toHaveBeenCalledWith("Enter path");
  });

  it("never sends (or clears) blank input", async () => {
    const onSend = vi.fn(() => Promise.resolve());

    render(<ConversationInput onSend={onSend} />);
    const textarea = typeInto("   ");
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe("   ");
  });
});
