import { describe, it, expect } from "vitest";

/**
 * D-71 data remediation: unit tests for the pure owner-resolution logic in
 * scripts/migrate-backfill-node-userid.ts.
 *
 * Background: RC-6 stamps userId onto graph nodes going forward, but pre-fix
 * nodes carry only bookId. The RC-6 read guard keys off NODE userId, so legacy
 * nodes must be stamped. Owner resolution is unambiguous — a node has one
 * bookId, and Book.userId is a single non-null column — so the only decisions
 * are: stamp with the book owner, leave an already-stamped node untouched, or
 * report a node whose book is gone as an anomaly (never guess an owner).
 */
import {
  decideNodeUserIdBackfill,
  type NodeToClassify,
} from "../../scripts/migrate-backfill-node-userid";

const USER_A = "4611e6b9-0982-4443-9747-eccf4f36560e";
const USER_B = "a2c9f1d0-1111-2222-3333-444455556666";
const BOOK_A = "book-a-owned-by-A";
const BOOK_B = "book-b-owned-by-B";

const owners = new Map<string, string>([
  [BOOK_A, USER_A],
  [BOOK_B, USER_B],
]);

function node(over: Partial<NodeToClassify>): NodeToClassify {
  return { bookId: BOOK_A, userId: null, ...over };
}

describe("decideNodeUserIdBackfill — D-71 node owner resolution", () => {
  it("backfills an unstamped node with the owner of its book", () => {
    const d = decideNodeUserIdBackfill(node({ bookId: BOOK_A, userId: null }), owners);
    expect(d.kind).toBe("backfill");
    if (d.kind === "backfill") {
      expect(d.userId).toBe(USER_A);
      expect(d.reason).toMatch(/owner of book/i);
    }
  });

  it("resolves each node to its own book's owner", () => {
    const a = decideNodeUserIdBackfill(node({ bookId: BOOK_A }), owners);
    const b = decideNodeUserIdBackfill(node({ bookId: BOOK_B }), owners);
    expect(a.kind === "backfill" && a.userId).toBe(USER_A);
    expect(b.kind === "backfill" && b.userId).toBe(USER_B);
  });

  it("reports an unstamped node whose book is absent from Postgres as an anomaly — never guesses an owner", () => {
    const d = decideNodeUserIdBackfill(
      node({ bookId: "deleted-book", userId: null }),
      owners
    );
    expect(d.kind).toBe("anomaly");
    if (d.kind === "anomaly") {
      expect(d.reason).toMatch(/not found in Postgres/i);
    }
  });

  it("never overwrites a node that already carries a userId (idempotent no-op)", () => {
    const d = decideNodeUserIdBackfill(
      node({ bookId: BOOK_A, userId: USER_B }), // deliberately NOT the book owner
      owners
    );
    expect(d.kind).toBe("already_stamped");
    if (d.kind === "already_stamped") {
      expect(d.reason).toMatch(/never overwritten/i);
    }
  });

  it("leaves an already-stamped node untouched even when its book is gone (existing stamp wins over anomaly)", () => {
    // The never-overwrite check runs BEFORE book resolution, so a stamped node
    // on an orphaned book is a no-op, not an anomaly.
    const d = decideNodeUserIdBackfill(
      { bookId: "deleted-book", userId: USER_A },
      owners
    );
    expect(d.kind).toBe("already_stamped");
  });

  it("treats an empty owner map as: every unstamped node is an anomaly", () => {
    const d = decideNodeUserIdBackfill(node({ userId: null }), new Map());
    expect(d.kind).toBe("anomaly");
  });
});
