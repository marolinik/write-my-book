import { describe, it, expect } from "vitest";
import { computeConversationView } from "@/lib/editorial/finding-conversation";

const u = (content: string) => ({ role: "user" as const, content });
const a = (content: string) => ({ role: "assistant" as const, content });

describe("computeConversationView", () => {
  it("counts user turns and allows discussion under cap for pending finding", () => {
    const v = computeConversationView({ replies: [u("a"), a("b")], findingStatus: "pending" });
    expect(v.userTurns).toBe(1);
    expect(v.canDiscuss).toBe(true);
    expect(v.resolution).toBe("pending");
  });

  it("caps at 3 user turns", () => {
    const v = computeConversationView({ replies: [u("1"), a("x"), u("2"), a("y"), u("3")], findingStatus: "pending" });
    expect(v.userTurns).toBe(3);
    expect(v.canDiscuss).toBe(false);
    expect(v.resolution).toBe("capped");
  });

  it("latestRevision is the newest assistant turn that HAS a revision (later plain turn hides it)", () => {
    const withRev = a(["ok", "<<<REVISION>>>", "suggestion: new text", "why: better", "<<<END>>>"].join("\n"));
    const plain = a("I agree, keep it.");
    const v = computeConversationView({ replies: [u("i"), withRev, u("ii"), plain], findingStatus: "pending" });
    expect(v.latestRevision).toBeUndefined();
    const v2 = computeConversationView({ replies: [u("i"), plain, u("ii"), withRev], findingStatus: "pending" });
    expect(v2.latestRevision).toBe("new text");
  });

  it("applied/dismissed are read-only resolutions", () => {
    expect(computeConversationView({ replies: [], findingStatus: "applied" }).resolution).toBe("applied");
    expect(computeConversationView({ replies: [], findingStatus: "dismissed" }).canDiscuss).toBe(false);
  });

  it("is crash-safe on a corrupted assistant row", () => {
    const bad = a("prose\n<<<REVISION>>>\nsuggestion:"); // unclosed
    expect(() => computeConversationView({ replies: [u("x"), bad], findingStatus: "pending" })).not.toThrow();
  });
});
