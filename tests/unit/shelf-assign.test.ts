import { describe, it, expect } from "vitest";
import { assignShelf } from "@/lib/shelf/assign-shelf";

const base = { status: "writing", archivedAt: null as Date | null, pendingFindings: 0 };

describe("assignShelf (single-membership, first-match precedence)", () => {
  it("archivedAt set → archived, regardless of status or findings", () => {
    expect(assignShelf({ status: "complete", archivedAt: new Date(), pendingFindings: 5 })).toBe("archived");
    expect(assignShelf({ ...base, archivedAt: new Date() })).toBe("archived");
  });

  it("status complete or export → completed", () => {
    expect(assignShelf({ ...base, status: "complete" })).toBe("completed");
    expect(assignShelf({ ...base, status: "export" })).toBe("completed");
  });

  it("completed beats waiting: complete + pending findings → completed", () => {
    expect(assignShelf({ ...base, status: "complete", pendingFindings: 3 })).toBe("completed");
  });

  it("pending findings on an active book → waiting", () => {
    expect(assignShelf({ ...base, status: "writing", pendingFindings: 1 })).toBe("waiting");
  });

  it("status beta → waiting (out with beta readers)", () => {
    expect(assignShelf({ ...base, status: "beta", pendingFindings: 0 })).toBe("waiting");
  });

  it("bare active statuses with no findings → currentlyWriting", () => {
    for (const status of ["concept", "planning", "writing", "editing"]) {
      expect(assignShelf({ ...base, status })).toBe("currentlyWriting");
    }
  });
});
