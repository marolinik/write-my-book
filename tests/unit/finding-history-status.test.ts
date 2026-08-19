import { describe, it, expect } from "vitest";
import { findingHistoryStatus } from "@/lib/agents/finding-history-status";

/**
 * D-55: a writer DISMISSAL must not be recorded as a system REJECT. The two are
 * distinguished by the `status` column ("dismissed" vs "rejected"); the shared
 * `rejectedAt` reject-timestamp is no longer stamped on a dismissal. The
 * <finding_history> renderer must therefore derive the display status from
 * `status` first (falling back to the legacy timestamps for older rows) so a
 * dismissed finding still reads as [dismissed], not [pending].
 */
describe("findingHistoryStatus (D-55: dismiss is not reject)", () => {
  it("a writer dismissal — status 'dismissed', NO reject timestamp — renders as dismissed (not pending)", () => {
    expect(
      findingHistoryStatus({ status: "dismissed", appliedAt: null, rejectedAt: null })
    ).toBe("dismissed");
  });

  it("an applied finding renders as applied", () => {
    expect(
      findingHistoryStatus({ status: "applied", appliedAt: new Date(), rejectedAt: null })
    ).toBe("applied");
  });

  it("a pending finding renders as pending", () => {
    expect(
      findingHistoryStatus({ status: "pending", appliedAt: null, rejectedAt: null })
    ).toBe("pending");
  });

  it("a system-rejected finding (status 'rejected' + rejectedAt) still reads as resolved (dismissed)", () => {
    expect(
      findingHistoryStatus({ status: "rejected", appliedAt: null, rejectedAt: new Date() })
    ).toBe("dismissed");
  });

  it("back-compat: a legacy dismissed row that still carries rejectedAt renders as dismissed", () => {
    expect(
      findingHistoryStatus({ status: "dismissed", appliedAt: null, rejectedAt: new Date() })
    ).toBe("dismissed");
  });
});
