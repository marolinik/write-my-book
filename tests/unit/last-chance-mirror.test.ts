// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  writeLastChanceDraft,
  readLastChanceDraft,
  clearLastChanceDraft,
  pruneStaleLastChanceDrafts,
  lastChanceKeyFor,
  LAST_CHANCE_MAX_MARKDOWN_LENGTH,
} from "@/lib/offline/last-chance-mirror";
import { getClientId, DRAFT_MAX_AGE_MS } from "@/lib/offline/draft-store";

/**
 * D-24 — the IndexedDB draft buffer alone loses 100% of unsaved typing on a
 * hard crash: its first interval tick lands 2s after the pane goes dirty and
 * its unload flush is asynchronous (an IDB put initiated during teardown may
 * never commit) — and on a true hard kill no unload event fires at all.
 *
 * The last-chance mirror closes that hole: a SYNCHRONOUS localStorage write
 * per editor update, so the newest keystrokes are durable in the same task
 * that produced them. These tests cover the storage module itself.
 */

const CH = "ch-mirror-1";

function writeSample(markdown = "Base. crash-marker") {
  return writeLastChanceDraft({
    chapterId: CH,
    bookId: "book-1",
    markdown,
    baseVersion: 3,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("last-chance-mirror — synchronous localStorage draft mirror (D-24)", () => {
  it("round-trips a draft and stamps updatedAt + this tab's clientId", () => {
    const before = Date.now();
    expect(writeSample()).toBe(true);

    const row = readLastChanceDraft(CH);
    expect(row).not.toBeNull();
    expect(row?.markdown).toBe("Base. crash-marker");
    expect(row?.bookId).toBe("book-1");
    expect(row?.baseVersion).toBe(3);
    expect(row?.clientId).toBe(getClientId());
    expect(row?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("returns null for a missing row", () => {
    expect(readLastChanceDraft("nope")).toBeNull();
  });

  it("drops and removes a corrupt row instead of throwing", () => {
    localStorage.setItem(lastChanceKeyFor(CH), "{not json");
    expect(readLastChanceDraft(CH)).toBeNull();
    expect(localStorage.getItem(lastChanceKeyFor(CH))).toBeNull();
  });

  it("clear({ onlyIfMine }) leaves a foreign tab's row intact; unconditional clear removes it", () => {
    writeSample();
    const raw = JSON.parse(localStorage.getItem(lastChanceKeyFor(CH))!);
    localStorage.setItem(
      lastChanceKeyFor(CH),
      JSON.stringify({ ...raw, clientId: "foreign-tab" })
    );

    expect(clearLastChanceDraft(CH, { onlyIfMine: true })).toBe(false);
    expect(readLastChanceDraft(CH)).not.toBeNull();

    expect(clearLastChanceDraft(CH)).toBe(true);
    expect(readLastChanceDraft(CH)).toBeNull();
  });

  it("prunes rows older than the max age, keeps fresh ones", () => {
    writeSample("fresh");
    writeLastChanceDraft({
      chapterId: "ch-old",
      bookId: "book-1",
      markdown: "stale",
      baseVersion: 1,
    });
    const oldRaw = JSON.parse(localStorage.getItem(lastChanceKeyFor("ch-old"))!);
    localStorage.setItem(
      lastChanceKeyFor("ch-old"),
      JSON.stringify({
        ...oldRaw,
        updatedAt: Date.now() - DRAFT_MAX_AGE_MS - 1000,
      })
    );

    expect(pruneStaleLastChanceDrafts()).toBe(1);
    expect(readLastChanceDraft("ch-old")).toBeNull();
    expect(readLastChanceDraft(CH)?.markdown).toBe("fresh");
  });

  it("refuses oversized markdown instead of risking the whole quota", () => {
    const huge = "x".repeat(LAST_CHANCE_MAX_MARKDOWN_LENGTH + 1);
    expect(
      writeLastChanceDraft({
        chapterId: CH,
        bookId: "book-1",
        markdown: huge,
        baseVersion: 1,
      })
    ).toBe(false);
    expect(readLastChanceDraft(CH)).toBeNull();
  });

  it("retries once after a quota failure and succeeds", () => {
    const original = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      calls += 1;
      if (calls === 1) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      return original.call(this, key, value);
    });

    expect(writeSample()).toBe(true);
    expect(readLastChanceDraft(CH)?.markdown).toBe("Base. crash-marker");
  });

  it("never throws when localStorage rejects persistently", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(writeSample()).toBe(false);
  });
});
