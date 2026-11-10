// P1-10: POST /editorial/triage ran platform-paid TypeSafe judgements with no
// rate limit, and re-judged every pending finding on each call because the
// selection never excluded findings it had already triaged. Nothing in the
// app called it (after-edit.ts is the intended caller). The route is gone and
// the service judges a finding once.
import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("platform-paid triage", () => {
  it("is not reachable from the API", () => {
    const route = join(__dirname, "..", "..", "src", "app", "api", "books", "[id]", "editorial", "triage", "route.ts");
    expect(existsSync(route)).toBe(false);
  });

  it("selects only findings it has not judged yet", async () => {
    vi.resetModules();
    const findMany = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ db: { editFinding: { findMany } } }));
    const { triageChapter } = await import("@/lib/editorial/triage-service");
    await triageChapter({
      bookId: "b",
      chapterNumber: 1,
      env: { FINDING_TRIAGE_ENABLED: "1", TYPESAFE_API_KEY: "k" },
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const calls = findMany.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>;
    expect(calls[0][0].where).toMatchObject({ status: "pending", triagedAt: null });
  });
});
