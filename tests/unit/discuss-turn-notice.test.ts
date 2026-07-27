import { describe, it, expect } from "vitest";
import {
  DISCUSS_TURN_CANCELLED,
  discussTurnNotice,
} from "@/lib/editorial/discuss-turn-notice";

/**
 * D-176 / D-178 — a discuss turn that does not land must SAY so.
 *
 * Before: `ConversationInput` swallowed every rejection ("let user retry") and
 * the thread rendered nothing, so a failed or cancelled turn was a silent wall
 * (D-129 family). Now the composer clears optimistically (D-178), which makes
 * silence unacceptable: the writer would see their sentence vanish with no
 * bubble and no notice. This maps a rejection onto one honest line.
 *
 * The cancel line may only claim what the server-side all-or-nothing abort
 * actually guarantees: nothing persisted, no exchange consumed. It must not
 * claim the provider did not charge — for the aborted 46-series turn it did.
 */

describe("discussTurnNotice", () => {
  it("reads a writer-initiated cancel as a calm, non-error outcome", () => {
    const notice = discussTurnNotice(new Error(DISCUSS_TURN_CANCELLED));
    expect(notice.tone).toBe("muted");
    expect(notice.text).toMatch(/cancel/i);
    expect(notice.text).toMatch(/exchange/i);
    expect(notice.text).not.toMatch(/bill|charge/i);
  });

  it("translates the rate-limit sentinel into writer language", () => {
    const notice = discussTurnNotice(new Error("rate_limited"));
    expect(notice.tone).toBe("error");
    expect(notice.text).not.toMatch(/rate_limited/);
    expect(notice.text.length).toBeGreaterThan(10);
  });

  it("passes a server-authored message through verbatim (it is already writer-facing)", () => {
    const server = "The editor's reply was interrupted before it finished.";
    expect(discussTurnNotice(new Error(server))).toEqual({ tone: "error", text: server });
  });

  it("never yields an empty notice for a thrown non-Error or blank message", () => {
    for (const bad of [undefined, null, {}, "", new Error("")]) {
      const notice = discussTurnNotice(bad);
      expect(notice.text.trim().length).toBeGreaterThan(0);
      expect(notice.tone).toBe("error");
    }
  });
});
